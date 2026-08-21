# NB-IoT Uplink Access Simulator

A discrete-time simulation of two **NB-IoT uplink access schemes**, used both
as a standalone comparison tool and as a reinforcement-learning environment:

- **Random Access (RA)** — contention-based, using NPRACH preambles and NPUSCH data transmission
- **Fast Uplink Grant (FUG)** — contention-free, proactive grants with a per-device recurring period

The simulator models device state (PSM/idle/paging/connected/uplink/downlink),
physical-layer impairments (SINR, BLER), scheduling, per-device traffic
generation, and packet-level delay/outage accounting at the slot level. The
physical layer follows the 3GPP TR 38.901 / ITU-R M.2412 Urban Macro-mMTC
channel model (see Physical Layer below).

FUG's grant periodicity can be fixed, round-robin, an oracle predictor, or
**learned by a reinforcement-learning policy** (MaskablePPO with a scalable,
weight-shared architecture) — see Reinforcement Learning below.

---

## Project Structure

```
src/
├── devices/
│   ├── base_station.py          # NPUSCH/NPRACH resource scheduling, FUG grant bookkeeping
│   └── device_statemachine.py   # StateMachine (base FSM + traffic generation),
│                                 # RandomAccessStateMachine, FugStateMachine
├── mediator/
│   └── mediators.py             # RAMediator, DataMediator, FugMediator: per-slot
│                                 # coordination between devices and the base station
├── network/
│   ├── physical_layer.py        # Path loss (TR 38.901 UMa), SINR, BLER
│   └── bler_function.py         # Fitted BLER curves
├── evaluation/
│   └── access_capacity.py       # Packet-level RA/FUG simulation + connection-density search
├── experiments/
│   └── capacity_vs_snr.py       # CLI: capacity-vs-SNR sweep across schemes
└── environment/                 # layered: env -> policies -> training -> tuning,
    │                              # with reporting/evaluate on top
    ├── cli.py                   # Argparse value types + the argument groups every
    │                              # command shares (scenario, evaluation, study)
    ├── scenario.py              # ScenarioConfig: one resolved environment configuration
    ├── nbiot_env/               # Gymnasium environments (base_env.py, scalable_env.py,
    │                              # rewards.py, constants.py, devices.py, timing.py)
    ├── policies/
    │   └── scalable.py          # Weight-shared, per-device-critic MaskablePPO policy
    ├── training/                # CLI: python -m src.environment.training
    │   ├── algorithms.py        # Which --algo values exist and what each is made of
    │   ├── hyperparameters.py   # Stored trial values -> constructor arguments
    │   ├── environments.py      # VecEnv construction and VecNormalize persistence
    │   ├── callbacks.py         # Fixed-seed evaluation, checkpointing, TensorBoard
    │   ├── session.py           # Env + callback stack shared with a tuning trial
    │   ├── artifacts.py         # Checkpoint choice, plots, metrics for a finished run
    │   ├── cli.py               # Training-specific flags
    │   └── run.py               # --train-best / --resume
    ├── tuning/                  # CLI: python -m src.environment.tuning
    │   ├── search_space.py      # The Optuna search space; reading a study back
    │   ├── callbacks.py         # Evaluation callbacks that report to the pruner
    │   └── run.py               # The trial objective and the study loop
    ├── reporting/
    │   ├── rollout.py           # One deterministic episode -> per-step series
    │   ├── plots.py             # Evaluation plots (buffer, period tracking, activity)
    │   └── run_artifacts.py     # Run directories, config.json, plot footers
    └── evaluate/                # CLIs that measure an already-trained checkpoint
        ├── baselines.py         # Round-robin / constant-period baselines
        ├── scaling.py           # One scalable checkpoint across device counts
        ├── interval_change.py   # Response to a mid-episode traffic change
        └── multi_seed.py        # Multi-seed comparison and sensitivity sweeps

graphs/
├── state-diagram.png            # RA device state machine
└── fug_state_chart.png          # FUG device state machine, with buffer/timers

tests/
└── ...                          # pytest suite covering mediators, FUG scheduling,
                                   # grant accounting, RL contract, scaling architecture
```

`src/main.py` and the `TransmissionStats`/`SimulationStats` classes it used
have been removed — `access_capacity.py`/`capacity_vs_snr.py` supersede that
functionality with packet-level (not attempt-level) accounting, multi-seed
averaging, and proper capacity search.

---

## Usage

### Prerequisites

Install dependencies with [uv](https://github.com/astral-sh/uv):

```bash
uv sync
```

### Compare Random Access capacity across SNR

`capacity_vs_snr.py` finds the largest number of devices that stays below a
target packet-outage probability, at each of a sweep of fixed SNR values.
Outage is packet-level: a packet is only counted as delivered if it actually
left a device's buffer, verified via buffer-delta accounting rather than
trusting a mediator's self-reported success count. It uses the analytical,
distance-free SNR model (every device pinned to the same nominal SNR,
comparable to Moons et al.'s own Fig. 5) -- see `capacity_vs_radius.py`
below for the real-physical-layer, geometry-based equivalent. FUG's fixed
round-robin/predictive baselines have been removed; the FUG comparison
point is a trained RL policy (`capacity_vs_snr_rl.py`), not a fixed
period formula.

Traffic is periodic: one packet every `--generation-period` slots, always
eligible for access (no separate activity concept). If `--generation-start`
is omitted, each device gets a seeded random phase offset.

```bash
uv run python -m src.experiments.capacity_vs_snr \
  --generation-period 5 \
  --snr-min -4 --snr-max 10 --snr-points 8 \
  --slots 10000 \
  --target-outage 0.01 \
  --seeds 1,2,3 \
  --max-devices 64 \
  --output results/capacity-periodic5
```

The default outage definition (`--outage-metric remaining_at_end`) counts a
packet as outaged only if it is still buffered when the simulation ends.
`--outage-metric connection_density`, together with `--delay-budget-slots`,
switches to an ITU-R M.2412-style delay-based definition: a packet counts as
outaged if it is not delivered within the budget, even if eventually
delivered. This simulator does not fix a slot duration, so the budget is
expressed in slots, not seconds — pick it deliberately for the traffic in
use; at moderate load the 10-slot placeholder default can be far too tight
and will drive capacity to 0 for reasons unrelated to SNR. The budget is a
passive classification only: a packet past it is counted as outaged but is
still retried, never dropped.

The output directory contains the plotted comparison, the capacity summary,
every evaluated device count, and the full experiment configuration. A result
marked `capacity_capped: true` only reached `--max-devices`; increase that
limit to find the actual boundary.

### Train the reinforcement-learning scheduler

FUG's grant period can be learned instead of fixed. Tuning and training are
two separate commands: `src.environment.tuning` searches hyperparameters and
stores the winner in an Optuna study, and `src.environment.training` reads
that study back. Tune once per scenario, then train from it as often as you
like. Use a readable run name when comparing configurations:

```bash
uv run python -m src.environment.tuning \
  --algo scalable-maskable-ppo \
  --devices 20 \
  --trials 40 \
  --trial-steps 100000 \
  --envs 8 \
  --study-name fug-scalable-maskable-ppo-20devices-v1

uv run python -m src.environment.training \
  --train-best \
  --algo scalable-maskable-ppo \
  --steps 4000000 \
  --envs 8 \
  --devices 20 \
  --seed 42 \
  --study-name fug-scalable-maskable-ppo-20devices-v1 \
  --run-name dev20-scalable-maskable-ppo-seed42 \
  --eval-freq 100000 \
  --eval-episodes 20
```

`--algo` supports `scalable-maskable-ppo` (the default) and `ppo`.
`scalable-maskable-ppo` masks out period choices that cannot take effect
between grant boundaries — at a decision boundary all 15 periods are valid,
otherwise only the device's currently active period is — and keeps a fixed
padded interface (`SCALABLE_MAX_DEVICES`, currently 32) regardless of how
many real devices are simulated, so the same trained policy applies to
device populations different from what it was trained on. `ppo` is the
flat-observation ablation: no masking, no padding, and an action layer sized
to the exact device count it trained at. Resume a checkpoint with the same
`--algo` that created it; checkpoint types are not interchangeable.

Every final training run is stored independently under `results/`:

```text
results/dev20-scalable-maskable-ppo-seed42/
├── config.json       # complete training, environment, reward, and Git metadata
├── metrics.json      # summary of the plotted evaluation episode
├── models/
│   ├── best_model.zip
│   ├── best_vecnormalize.pkl
│   ├── final_model.zip
│   └── final_vecnormalize.pkl
├── plots/
├── tensorboard/
├── train/
├── eval/
└── evaluations/
```

If `--run-name` is omitted, a name containing the date, device count, traffic
configuration, and seed is generated automatically; existing run directories
are never overwritten.

---

## Architecture

### Device state machine

Both access schemes share one underlying finite state machine (PSM → idle →
paging → connected → uplink/downlink), extended per scheme in
`RandomAccessStateMachine` and `FugStateMachine`:

<img src="./graphs/state-diagram.png" width="700">

<img src="./graphs/fug_state_chart.png" width="700">

A device's data buffer holds `(payload_bytes, arrival_slot)` entries — every
buffered packet carries a real arrival timestamp, used for delay
classification.

### Traffic generation

`StateMachine.generate_data()` is purely periodic: one packet every
`data_generation_interval` slots, unconditionally, offset by the device's
own `data_generation_time`.

This lives entirely at the device level — there is no separate,
mediator-level activity gate. `RAMediator` eligibility for NPRACH is simply
"does this device have buffered data"; `FugMediator` eligibility is governed
by each device's own recurring grant schedule and buffer state via
`check_data()`.

### Random Access (RA)

`RAMediator` drives the slot loop:

```
Device has buffered data
     │
     ▼
[NPRACH] Choose a random preamble index from a pool of 48
     │
     ▼
Collision (shared preamble) or PHY failure (BLER)? ──Yes──► Retry next slot
     │No
     ▼
BS assigns an NPUSCH subcarrier (round-robin)
     │
     ▼
PHY failure (BLER)? ──Yes──► Retry
     │No
     ▼
Packet delivered ✓
```

Collision detection groups devices that selected the same preamble in the
same slot; any bucket with more than one device is a collision, and all
colliding devices retry independently.

### Fast Uplink Grant (FUG)

`FugMediator` pre-assigns each device a recurring grant: a subcarrier, a
start slot, and a period. A device wakes autonomously when its own grant
occasion comes due (the base station never wakes a sleeping device — a
device in PSM does not monitor paging). The device's own FUG timer is the
only clock that decides this: the start slot the base station assigns is
where that timer is zeroed, so the first occasion falls one period later,
and the base station's grant record exists only to reserve the subcarrier.

```
Device's own FUG timer reaches its grant period
     │
     ▼
Grant due — does the device have buffered data?
     │                              │
    Yes                             No
     │                              ▼
     ▼                        Grant wasted
PHY failure (BLER)? ──Yes──► Retry at next grant occasion
     │No
     ▼
Packet delivered ✓
```

The grant period can be **fixed** (round-robin, sized to device
count/subcarrier capacity), an **oracle** (matches the true traffic interval
exactly — an upper bound on any fixed-period policy, not a predictor), or
**learned** by the RL policy described below.

### Physical Layer

Both channels share the same `PhysicalLayer` model, following the 3GPP
TR 38.901 / ITU-R M.2412 Urban Macro-mMTC (Configuration A) parameters:

| Parameter         | Value                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Carrier frequency | 700 MHz                                                                                           |
| Cell radius       | 250 m (half the M.2412 Config A inter-site distance of 500 m)                                     |
| Device distance   | Disk point-picking, uniform by area, in [10, 250] m                                               |
| Path loss         | UMa NLOS: `max(PL_LOS, PL'_NLOS)`; NLOS dominates over the whole valid range for these parameters |
| Shadow fading σ   | 6 dB (parameterized; disabled in the current received-power calculation)                          |
| Device TX power   | 14 dBm (Release-14 power class; M.2412's own baseline specifies 23 dBm)                           |
| BS noise figure   | 5 dB                                                                                              |

| Channel | Subcarrier spacing | Repetitions |
| ------- | ------------------ | ----------- |
| NPRACH  | 3.75 kHz           | 8           |
| NPUSCH  | 15 kHz             | 2           |

BLER is looked up from fitted curves (`bler_function.py`) against the
resulting SINR.

---

## Reinforcement Learning

FUG's grant period can be learned instead of fixed. The environment
(`nbiot_env/base_env.py`, `scalable_env.py`) is a Gymnasium `MultiDiscrete`
action space (one categorical choice of period per device slot) with
invalid-action masking, trained with MaskablePPO.

**Scalable architecture** (`environment/policies/scalable.py`), for populations larger than
can be tied to a fixed-size policy:

- Each device's rolling history window is encoded by a **shared GRU**.
- Device embeddings exchange context through **masked multi-head
  self-attention**, so each device attends only over currently-active
  devices — padded slots are excluded.
- A **shared actor MLP** maps each device's own embedding plus context to a
  categorical distribution over periods — identical weights regardless of
  device index or count, so parameter count doesn't grow with population
  size.
- A **separate per-device critic**, structured like the actor but with its
  own weights, produces a value estimate per device from its own embedding
  before pooling into the scalar value PPO needs. This is deliberate: a
  single value function computed from an already-pooled, device-agnostic
  representation collapses every device's situation into one blurred
  average, which under-serves some devices while others converge — the
  per-device critic gives the value function per-device resolution before
  pooling instead of after.

Default reward weights (`nbiot_env/constants.py`):

| Term                    | Weight | Sign |
| ----------------------- | ------ | ---- |
| Successful transmission | 2.0    | +    |
| Buffer reduction        | 3.0    | +    |
| Wasted grant            | 2.0    | −    |
| Mean buffer occupancy   | 0.25   | −    |
| Max buffer occupancy    | 0.25   | −    |
| Queuing delay           | 2.0    | −    |
| Accepted period change  | 0.5    | −    |

(`buffer_imbalance` and `buffer_growth` exist as reward terms with weight 0
by default.)

`evaluate/scaling.py` evaluates a fixed scalable checkpoint across a sweep of
device counts, using its own saved `VecNormalize` statistics — meaningful
only for scalable checkpoints, since fixed-size (`maskable-ppo`) checkpoints
tie their action/observation shape to the device count they were trained
with.

### Related work

| Paper                                                                                                           | Network and scheduling decision                                                              | Algorithm                                                                                    | Main objective / measurements                                                          | Relevance to this project                                                                                                                                                                 | Link                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Deep Reinforcement Learning for Scheduling Uplink IoT Traffic with Strict Deadlines** (Robaglia et al., 2021) | A base station polls one device per slot under hidden periodic traffic and packet deadlines. | PPO with a recurrent neural network; also proposes invalid-action masking as _Filtered PPO_. | Successful transmissions, discarded packets, and learning under partial observability. | **Very high.** Closest learning problem: PPO must infer periodic traffic from scheduling outcomes. It selects the next device; this project selects each device's recurring grant period. | [PDF](https://marceaucoupechoux.wp.imt.fr/files/2021/10/globecom21.pdf) · [IEEE](https://ieeexplore.ieee.org/document/9685561/) |
| **Random Access Control in NB-IoT With Model-Based Reinforcement Learning** (Alcaraz et al., 2025)              | NB-IoT random-access control via model-based RL.                                             | Model-based reinforcement learning.                                                          | Resource use and adaptation under NPRACH configuration.                                | **High at the protocol level.** Directly addresses NB-IoT access control; this project addresses the proactive-grant alternative rather than RA parameter tuning.                         | [DOI](https://doi.org/10.1109/JIOT.2024.3499854)                                                                                |
| **Buffer-aware Wireless Scheduling based on Deep Reinforcement Learning** (Xu et al., 2019)                     | Cellular packet scheduling with finite buffers, delay constraints, and varying active users. | Advantage Actor-Critic (A2C) with action masking.                                            | Throughput, Jain fairness, packet-drop rate, queue occupancy, and delay.               | **High.** Queue-aware observations and delay/drop objectives map directly onto this project's buffer and wasted-grant terms.                                                              | [arXiv](https://arxiv.org/abs/1911.05281)                                                                                       |
| **Traffic Prediction Based Fast Uplink Grant for Massive IoT** (Shehab et al., 2020)                            | Predicts each device's activity probability and grants the highest-likelihood device.        | Hidden Markov Model and binary On-Off Markov traffic.                                        | Resource efficiency, regret, and Age of Information vs. random access.                 | **Very high.** A direct model-based FUG baseline: it explicitly models traffic transitions rather than learning a period from buffer/grant outcomes.                                      | [arXiv](https://arxiv.org/abs/2008.02207)                                                                                       |
| **A Learning-Based Fast Uplink Grant for Massive IoT via SVM and LSTM** (Eldeeb et al., 2021)                   | SVM prioritization plus LSTM traffic prediction/correction before grant assignment.          | Supervised predict-then-grant.                                                               | Throughput and latency under correlated massive-IoT traffic.                           | **Very high.** A supervised predict-then-grant alternative to this project's end-to-end RL approach.                                                                                      | [arXiv](https://arxiv.org/abs/2108.10070)                                                                                       |
| **Counterfactual Multi-Agent Policy Gradients** (Foerster et al., 2018)                                         | Cooperative multi-agent control with a shared team reward.                                   | Centralized critic with a counterfactual baseline (COMA).                                    | Credit assignment under a shared reward.                                               | **High, architecturally.** The centralized-critic/decentralized-actor split and the credit-assignment problem it addresses motivate this project's per-device critic.                     | [AAAI](https://doi.org/10.1609/aaai.v32i1.11794)                                                                                |

---

## Related repository

The Intelligent-Uplink-Access-Simulation project (Moons et al., cited
throughout this project's paper as the baseline being extended) explores a
lower-level, C++ analytical version of the RA/controlled-access/FUG
comparison, including an ITU-R M.2412-aligned channel model and a
deadline-and-reschedule mechanism (`new/code/cpp/main.cc`).
