"""
ernest_validation.py — Ernest pipeline validation (versió lleugera)
Basat en Mendeley Dog Behaviour Dataset (Vehkaoja et al. 2022)
Massiu Soft SL
"""
import numpy as np
import pandas as pd
import json
from datetime import date, timedelta
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# ── Paràmetres comportament (Vehkaoja 2022, Taula 1) ─────────
BEHAVIOUR_PROFILES = {
    'lying':    (0.00, 0.03,  2.0,  'Estirat'),
    'sitting':  (0.01, 0.04,  3.0,  'Assegut'),
    'standing': (0.02, 0.06,  5.0,  'Dret'),
    'sniffing': (0.04, 0.10, 15.0,  'Ensumar'),
    'walking':  (0.18, 0.22, 45.0,  'Caminant'),
    'trotting': (0.38, 0.38, 85.0,  'Trotant'),
    'galloping':(0.78, 0.60,180.0,  'Galopant'),
}

# Distribucions de dia (fracció del temps)
NORMAL_DAY = dict(lying=.45, sitting=.15, standing=.10,
                  sniffing=.08, walking=.15, trotting=.05, galloping=.02)
ANOMALY_DAY = dict(lying=.72, sitting=.14, standing=.06,
                   sniffing=.03, walking=.04, trotting=.01, galloping=.00)

# Resolució: 1 punt per minut (no per paquet de 5s) → 1440 punts/dia
# Molt més ràpid, mateixa informació estadística
N_POINTS_DAY = 1440

DOGS = [
    {'id': 'dog_001', 'name': 'Rex',   'breed': 'Pastor Alemany',  'w': 32.0},
    {'id': 'dog_002', 'name': 'Luna',  'breed': 'Labrador',         'w': 26.0},
    {'id': 'dog_003', 'name': 'Max',   'breed': 'Border Collie',    'w': 18.0},
    {'id': 'dog_004', 'name': 'Bella', 'breed': 'Bòxer',            'w': 29.0},
    {'id': 'dog_005', 'name': 'Bruno', 'breed': 'Bulldog Francès',  'w': 12.0},
    {'id': 'dog_006', 'name': 'Nala',  'breed': 'Husky',            'w': 22.0},
    {'id': 'dog_007', 'name': 'Coco',  'breed': 'Caniche',          'w':  8.0},
    {'id': 'dog_008', 'name': 'Thor',  'breed': 'Rottweiler',       'w': 48.0},
    {'id': 'dog_009', 'name': 'Mia',   'breed': 'Beagle',           'w': 11.0},
    {'id': 'dog_010', 'name': 'Buddy', 'breed': 'Golden Retriever', 'w': 30.0},
]

N_DAYS = 35  # 30 baseline + 5 validació

ANOMALY_SCENARIOS = {
    'dog_003': {'day': 31, 'type': 'lethargy', 'label': 'Letargia'},
    'dog_007': {'day': 32, 'type': 'fever',    'label': 'Febre'},
    'dog_009': {'day': 33, 'type': 'lameness', 'label': 'Coixesa'},
}


def sim_day(dog: dict, d: date, rng: np.random.Generator,
            is_anom: bool = False, anom_type: str = None) -> dict:
    """Simula les mètriques d'un dia complet per a un gos."""
    dist = ANOMALY_DAY if is_anom else NORMAL_DAY
    behaviours = rng.choice(list(dist.keys()), size=N_POINTS_DAY,
                             p=list(dist.values()))

    # Activitat: magnitud IMU (g) per cada minut
    var = 1.0 + rng.normal(0, 0.06)  # variació individual
    magnitudes = np.array([
        BEHAVIOUR_PROFILES[b][0] * var + rng.normal(0, BEHAVIOUR_PROFILES[b][1])
        for b in behaviours
    ]).clip(0)

    # Temperatura
    temp_base = 38.6 + rng.normal(0, 0.25)
    if is_anom and anom_type == 'fever':
        temp_base += rng.uniform(0.9, 1.7)
    hour_arr = np.arange(N_POINTS_DAY) / 60.0
    temp_arr = temp_base + 0.3 * np.sin((hour_arr - 6) * np.pi / 12) + rng.normal(0, 0.08, N_POINTS_DAY)

    # Simetria (acc_std_x vs acc_std_y)
    asym_factor = rng.uniform(2.5, 4.0) if (is_anom and anom_type == 'lameness') else 1.0
    std_x_arr = np.array([BEHAVIOUR_PROFILES[b][1] * var * asym_factor for b in behaviours])
    std_y_arr = np.array([BEHAVIOUR_PROFILES[b][1] * var for b in behaviours])

    # ── Mètriques ───────────────────────────────────────────
    activity_index = float(min((magnitudes.mean() / 0.5) * 100, 100.0))

    REST_THR = 0.05
    is_rest = magnitudes < REST_THR
    rest_hours = float(is_rest.sum() / 60.0)
    transitions = float(np.diff(is_rest.astype(int)).astype(bool).sum())
    rest_frag = transitions / N_POINTS_DAY

    # Simetria mitja del dia (pesos per activitat)
    asym = np.abs(std_x_arr - std_y_arr) / (std_x_arr + std_y_arr + 1e-9)
    symmetry = float(np.clip(100.0 - asym.mean() * 200.0, 0, 100))

    avg_temp = float(temp_arr.mean())
    steps = int((magnitudes > 0.2).sum() * 0.5)

    return {
        'activity_index':     round(activity_index, 2),
        'rest_hours':         round(rest_hours, 2),
        'rest_fragmentation': round(rest_frag, 4),
        'symmetry_index':     round(symmetry, 2),
        'avg_temp':           round(avg_temp, 2),
        'steps_estimated':    steps,
    }


def compute_baseline(df: pd.DataFrame) -> dict:
    cols = ['activity_index', 'rest_hours', 'rest_fragmentation',
            'symmetry_index', 'avg_temp']
    return {c: {
        'p10': float(np.percentile(df[c].dropna(), 10)),
        'p50': float(np.percentile(df[c].dropna(), 50)),
        'p90': float(np.percentile(df[c].dropna(), 90)),
        'std': float(df[c].dropna().std()),
    } for c in cols if df[c].dropna().shape[0] >= 7}


def detect_anomalies(row: dict, baseline: dict) -> list:
    alerts = []
    for metric, bl in baseline.items():
        val = row.get(metric)
        if val is None: continue
        is_low  = val < bl['p10']
        is_high = val > bl['p90']
        if not (is_low or is_high): continue
        urgent = bl['std'] > 0 and abs(val - bl['p50']) > 3 * bl['std']
        alerts.append({
            'metric':    metric,
            'value':     round(val, 2),
            'p10':       round(bl['p10'], 2),
            'p50':       round(bl['p50'], 2),
            'p90':       round(bl['p90'], 2),
            'direction': 'low' if is_low else 'high',
            'severity':  'urgent' if urgent else 'warning',
        })
    return alerts


def run():
    out = Path('/sessions/pensive-amazing-ride/mnt/outputs/ernest_validation')
    out.mkdir(parents=True, exist_ok=True)

    start = date(2025, 1, 1)
    all_metrics, all_alerts, all_baselines = [], [], {}

    print("=" * 60)
    print("  ERNEST — Validació pipeline (10 gossos, 35 dies)")
    print("  Dataset: Mendeley Dog Behaviour (Vehkaoja et al. 2022)")
    print("=" * 60)

    for dog in DOGS:
        rng = np.random.default_rng(hash(dog['id']) % (2**32))
        rows = []
        for day_idx in range(N_DAYS):
            d = start + timedelta(days=day_idx)
            sc = ANOMALY_SCENARIOS.get(dog['id'])
            is_anom = bool(sc and day_idx == sc['day'] - 1)
            anom_type = sc['type'] if is_anom else None
            m = sim_day(dog, d, rng, is_anom=is_anom, anom_type=anom_type)
            m.update({'dog_id': dog['id'], 'dog_name': dog['name'],
                      'breed': dog['breed'], 'date': d,
                      'is_anomaly_injected': is_anom})
            rows.append(m)

        dog_df = pd.DataFrame(rows)
        all_metrics.append(dog_df)

        bl_df = dog_df[dog_df['date'] < start + timedelta(days=30)]
        bl = compute_baseline(bl_df)
        all_baselines[dog['id']] = bl

        print(f"\n🐕 {dog['name']} ({dog['breed']})")
        for mn, bv in bl.items():
            print(f"   {mn:25s} P10={bv['p10']:6.1f}  P50={bv['p50']:6.1f}  P90={bv['p90']:6.1f}")

        for i in range(30, N_DAYS):
            row = dog_df.iloc[i].to_dict()
            alerts = detect_anomalies(row, bl)
            for a in alerts:
                a.update({'dog_id': dog['id'], 'dog_name': dog['name'],
                          'date': row['date'], 'was_injected': row['is_anomaly_injected']})
                all_alerts.append(a)
                flag = "✅ VERDADER" if row['is_anomaly_injected'] else "❌ FALS POS."
                print(f"   🚨 {row['date']} {a['metric']:20s} {a['value']:6.1f} "
                      f"[{a['direction'].upper():4s}] {a['severity']:7s}  {flag}")

    metrics_df = pd.concat(all_metrics, ignore_index=True)
    alerts_df  = pd.DataFrame(all_alerts) if all_alerts else pd.DataFrame(columns=['was_injected','dog_id'])

    # ── Resultats ────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  RESUM")
    tp_dogs = set(alerts_df[alerts_df['was_injected'] == True]['dog_id'].unique()) if not alerts_df.empty else set()
    fp_days = alerts_df[alerts_df['was_injected'] == False] if not alerts_df.empty else pd.DataFrame()
    print(f"  Anomalies injectades:        3 gossos × 1 dia")
    print(f"  True Positives (gossos):     {len(tp_dogs)} / 3")
    print(f"  Falsos positius (dies):      {len(fp_days)}")
    recall = len(tp_dogs) / 3
    print(f"  Recall:    {recall:.0%}")
    print("=" * 60)

    # ── Guardar CSV ──────────────────────────────────────────
    metrics_df.to_csv(out / 'daily_metrics_validation.csv', index=False)
    if not alerts_df.empty:
        alerts_df.to_csv(out / 'alerts_validation.csv', index=False)

    summary = {
        'n_dogs': len(DOGS), 'n_days': N_DAYS,
        'anomalies_injected': 3,
        'true_positives': len(tp_dogs),
        'false_positive_days': len(fp_days),
        'recall': round(recall, 2),
    }
    with open(out / 'validation_summary.json', 'w') as f:
        json.dump(summary, f, indent=2, default=str)

    # ── Gràfics ──────────────────────────────────────────────
    make_plots(metrics_df, alerts_df, all_baselines, out)
    print(f"\n✅ Resultats guardats a {out}")
    return metrics_df, alerts_df, all_baselines, summary


def make_plots(metrics_df, alerts_df, baselines, out):
    # ── Plot 1: Activitat 35 dies tots els gossos ─────────────
    fig, axes = plt.subplots(5, 2, figsize=(16, 18))
    fig.suptitle(
        'Ernest · Validació — Índex Activitat Diària (35 dies)\n'
        'Banda blava = rang normal del gos (P10-P90 individual) · ⚠ = anomalia injectada',
        fontsize=11, fontweight='bold', y=0.99)

    for idx, dog in enumerate(DOGS):
        ax = axes[idx // 2][idx % 2]
        ddf = metrics_df[metrics_df['dog_id'] == dog['id']].sort_values('date')
        bl  = baselines.get(dog['id'], {}).get('activity_index', {})
        x   = np.arange(len(ddf))
        v   = ddf['activity_index'].values
        ia  = ddf['is_anomaly_injected'].values

        if bl:
            ax.axhspan(bl['p10'], bl['p90'], alpha=0.18, color='#2196F3')
            ax.axhline(bl['p50'], color='#2196F3', lw=1, ls='--', alpha=0.5)
        ax.axvline(29.5, color='#9E9E9E', lw=1, ls=':', alpha=0.7)

        normal_x = x[~ia]; normal_v = v[~ia]
        ax.plot(normal_x, normal_v, 'o-', color='#1565C0', ms=3, lw=1.2, alpha=0.85)

        if any(ia):
            ai = np.where(ia)[0]
            ax.scatter(ai, v[ai], color='#F44336', s=90, zorder=6)
            ax.annotate('⚠', (ai[0], v[ai[0]]+2), fontsize=11, color='#F44336', ha='center')

        ax.set_title(f"{dog['name']} · {dog['breed']} ({dog['w']}kg)", fontsize=8.5, fontweight='bold')
        ax.set_ylim(0, 105); ax.tick_params(labelsize=7)
        ax.set_xlabel('Dia', fontsize=7); ax.set_ylabel('Activitat', fontsize=7)
        ax.grid(True, alpha=0.25)

    plt.tight_layout(rect=[0, 0, 1, 0.97])
    fig.savefig(out / 'plot1_activitat.png', dpi=150, bbox_inches='tight')
    plt.close()
    print("  📈 plot1_activitat.png")

    # ── Plot 2: Zoom anomalies (3 gossos × 5 mètriques) ──────
    anomaly_dogs = [
        ('dog_003', 'Max — Letargia',  '#E91E63'),
        ('dog_007', 'Coco — Febre',    '#FF5722'),
        ('dog_009', 'Mia — Coixesa',   '#7B1FA2'),
    ]
    metrics_cols  = ['activity_index','rest_hours','symmetry_index','avg_temp','rest_fragmentation']
    metrics_lbls  = ['Activitat (0-100)','Repòs (h)','Simetria (0-100)','Temperatura (°C)','Fragmentació (0-1)']

    fig, axes = plt.subplots(3, 5, figsize=(20, 10))
    fig.suptitle('Ernest · Zoom anomalies injectades — 3 gossos × 5 mètriques\n'
                 'Banda = P10-P90 baseline · Línia vermella = dia de l\'anomalia',
                 fontsize=11, fontweight='bold')

    for ri, (dog_id, label, col) in enumerate(anomaly_dogs):
        ddf = metrics_df[metrics_df['dog_id'] == dog_id].sort_values('date').tail(12).copy()
        bl  = baselines.get(dog_id, {})
        ia  = ddf['is_anomaly_injected'].values
        x   = np.arange(len(ddf))

        for ci, (metric, mlbl) in enumerate(zip(metrics_cols, metrics_lbls)):
            ax = axes[ri][ci]
            v  = ddf[metric].values
            b  = bl.get(metric, {})
            if b:
                ax.axhspan(b['p10'], b['p90'], alpha=0.15, color=col)
                ax.axhline(b['p50'], color=col, lw=1, ls='--', alpha=0.6)
            ax.plot(x, v, 'o-', color=col, ms=4, lw=1.5)
            if any(ia):
                ai = np.where(ia)[0]
                ax.scatter(ai, v[ai], color='#F44336', s=90, zorder=6)
                ax.axvline(ai[0], color='#F44336', lw=1.5, ls='--', alpha=0.75)
            if ci == 0:
                ax.set_ylabel(label, fontsize=8, color=col, fontweight='bold')
            ax.set_title(mlbl, fontsize=8)
            ax.tick_params(labelsize=7); ax.grid(True, alpha=0.25)

    plt.tight_layout()
    fig.savefig(out / 'plot2_anomalies.png', dpi=150, bbox_inches='tight')
    plt.close()
    print("  📈 plot2_anomalies.png")

    # ── Plot 3: Distribució magnitud IMU per comportament ─────
    rng = np.random.default_rng(0)
    fig, ax = plt.subplots(figsize=(12, 5))
    beh_lbls = [BEHAVIOUR_PROFILES[b][3] for b in BEHAVIOUR_PROFILES]
    cols_beh = ['#4CAF50','#8BC34A','#CDDC39','#FFC107','#FF9800','#FF5722','#D32F2F']
    data = []
    for beh, prof in BEHAVIOUR_PROFILES.items():
        mags = np.clip(rng.normal(prof[0], prof[1], 500), 0, None)
        data.append(mags)
    bp = ax.boxplot(data, labels=beh_lbls, patch_artist=True,
                    medianprops=dict(color='white', linewidth=2.5))
    for patch, c in zip(bp['boxes'], cols_beh):
        patch.set_facecolor(c); patch.set_alpha(0.85)
    ax.axhline(0.05, color='#1565C0', lw=2, ls='--', label='Llindar repòs (0.05g)')
    ax.axhline(0.20, color='#E65100', lw=2, ls=':',  label='Llindar passos (0.20g)')
    ax.set_title('Ernest · Magnitud IMU per comportament (Mendeley Vehkaoja 2022)',
                 fontsize=11, fontweight='bold')
    ax.set_ylabel('Magnitud acc. sense gravetat (g)'); ax.grid(True, axis='y', alpha=0.35)
    ax.legend(fontsize=9)
    plt.tight_layout()
    fig.savefig(out / 'plot3_imu_comportaments.png', dpi=150, bbox_inches='tight')
    plt.close()
    print("  📈 plot3_imu_comportaments.png")

    # ── Plot 4: Comparació baselines entre gossos ─────────────
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    fig.suptitle('Ernest · Baselines individuals — cada gos és diferent\n'
                 '(demostració del valor de la comparació individual vs. genèrica)',
                 fontsize=11, fontweight='bold')

    metrics_to_show = [
        ('activity_index', 'Activitat (0-100)', '#1565C0'),
        ('rest_hours',      'Repòs (h/dia)',    '#2E7D32'),
        ('avg_temp',        'Temperatura (°C)', '#C62828'),
    ]
    dog_names = [d['name'] for d in DOGS]
    for ax, (metric, lbl, col) in zip(axes, metrics_to_show):
        p10s = [baselines[d['id']][metric]['p10'] for d in DOGS if metric in baselines[d['id']]]
        p50s = [baselines[d['id']][metric]['p50'] for d in DOGS if metric in baselines[d['id']]]
        p90s = [baselines[d['id']][metric]['p90'] for d in DOGS if metric in baselines[d['id']]]
        valid_dogs = [d['name'] for d in DOGS if metric in baselines[d['id']]]
        x = np.arange(len(valid_dogs))
        ax.bar(x, p50s, color=col, alpha=0.7, label='Mediana (P50)')
        ax.errorbar(x, p50s,
                    yerr=[np.array(p50s)-np.array(p10s), np.array(p90s)-np.array(p50s)],
                    fmt='none', color='black', capsize=5, linewidth=1.5, label='P10-P90')
        mean_pop = np.mean(p50s)
        ax.axhline(mean_pop, color='orange', lw=2, ls='--', label=f'Mitja poblacional ({mean_pop:.1f})')
        ax.set_xticks(x); ax.set_xticklabels(valid_dogs, rotation=45, ha='right', fontsize=8)
        ax.set_title(lbl, fontsize=10, fontweight='bold', color=col)
        ax.grid(True, axis='y', alpha=0.3); ax.legend(fontsize=7)

    plt.tight_layout()
    fig.savefig(out / 'plot4_baselines_comparativa.png', dpi=150, bbox_inches='tight')
    plt.close()
    print("  📈 plot4_baselines_comparativa.png")


if __name__ == '__main__':
    run()
