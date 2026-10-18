# %% [markdown]
# # OASIS-1 neuroimaging database: exploratory analysis + presentation assets
#
# **GenoBit · Neuroimaging project (relaunch).** This notebook answers *what is inside* the OASIS data we will use, and it
# also generates every image, animation frame and number used in the HTML presentation (`index.html`).
#
# It works with two sources:
#
# | Source | What it is | Size | How we get it |
# |---|---|---|---|
# | **Kaggle `ninadaithal/imagesoasis`** | OASIS-1 scans already cut into 2D JPG slices, sorted in 4 class folders | 86k files, 1.36 GB | `kagglehub` |
# | **OASIS-1 original release** | 3D MRI volumes (raw, bias-corrected, atlas-registered, skull-stripped, tissue segmentation) | 12 discs × ~1.4 GB | streamed: we only read the **first subject** of disc 1 (~115 MB) |
# | **OASIS-1 clinical table** | age, sex, MMSE, CDR, brain volume per session | 36 KB | spreadsheet from the OASIS site |
#
# **Two run modes** (chosen automatically in Section 1, can be overridden):
#
# - `full` — downloads the whole Kaggle dataset (default in **Google Colab**; needs ~3 GB free disk).
# - `lite` — downloads only the **file list** plus a stratified sample of images (~800 files). Every metadata result
#   (labels, subjects, scans, slices) is still computed on the **complete** dataset; only pixel statistics use the sample.
#   Use it on laptops with little free disk.
#
# **Outputs**
#
# - `outputs/figures`, `outputs/tables` — EDA figures and tables.
# - `assets/generated/` — images, sprites and `stats.js` consumed by the presentation. In Colab they are zipped and
#   downloaded at the end (Section 20) so they can be copied into the repository.
#
# | Section | Question |
# |---|---|
# | 1–3 | Setup, run mode, data index |
# | 4 | Where does the data come from? |
# | 5–6 | Folder structure and file names |
# | 7–8 | Labels, subjects, sessions, scans |
# | 9 | Clinical table: who are these people? |
# | 10 | Technical format of the images |
# | 11 | What the images look like (+ scan animations for the deck) |
# | 12 | Slice coverage: are these full 3D brains? |
# | 13 | Intensity by class |
# | 14 | Duplicates, near-duplicates and data leakage |
# | 15 | The original 3D volume and where the Kaggle JPGs come from |
# | 16–19 | Preprocessing techniques: bias field, skull stripping, segmentation, entropy & slice ranking |
# | 20 | Summary + export of presentation assets |

# %% [markdown]
# ## 1. Setup and run mode
# Installs whatever is missing (works the same in Colab and in a local Jupyter) and decides the run mode.

# %%
import sys, subprocess, importlib.util

IN_COLAB = 'google.colab' in sys.modules
REQUIRED = {'kagglehub': 'kagglehub', 'nibabel': 'nibabel', 'SimpleITK': 'SimpleITK',
            'skimage': 'scikit-image', 'openpyxl': 'openpyxl', 'requests': 'requests'}
missing = [pkg for mod, pkg in REQUIRED.items() if importlib.util.find_spec(mod) is None]
if missing:
    print('Installing:', missing)
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', *missing])
print('Running in Colab:', IN_COLAB)

# %%
import os, re, io, json, gzip, shutil, random, hashlib, tarfile, logging, time
from pathlib import Path
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from PIL import Image
import requests

SEED = 42
random.seed(SEED)
np.random.seed(SEED)
plt.rcParams.update({'figure.dpi': 110, 'axes.spines.top': False, 'axes.spines.right': False})
pd.set_option('display.max_columns', 30)
logging.getLogger('kagglehub').setLevel(logging.WARNING)

DATASET = 'ninadaithal/imagesoasis'
FREE_GB = shutil.disk_usage('.').free / 1e9

# ---- run mode -------------------------------------------------------------------------------
MODE = 'full' if (IN_COLAB or FREE_GB > 8) else 'lite'
# MODE = 'lite'   # <- uncomment to force the light mode
LITE_FULL_SCANS_PER_CLASS = 2    # complete scans (61 slices) downloaded per class in lite mode
LITE_RANDOM_PER_CLASS = 80       # extra random images per class in lite mode

# ---- folders --------------------------------------------------------------------------------
BASE = Path('/content') if IN_COLAB else Path('.')
WORK = BASE / ('oasis_work' if IN_COLAB else '.work')           # downloads/cache (not committed)
OUT = BASE / 'outputs'
FIG_DIR, TAB_DIR = OUT / 'figures', OUT / 'tables'
ASSET_DIR = BASE / ('presentation_assets' if IN_COLAB else 'assets/generated')
for p in (WORK, FIG_DIR, TAB_DIR, ASSET_DIR):
    p.mkdir(parents=True, exist_ok=True)

# Optional: keep a copy of the outputs in Google Drive (Colab only)
SAVE_TO_DRIVE = False
DRIVE_DIR = '/content/drive/MyDrive/Profe/Tercer semestre/Oasis'

# GenoBit palette (PlayBook) used in every figure, so plots match the slides
TEAL, SKY, INDIGO, LAV, INK, PAPER = '#00706F', '#A9CDE5', '#3D358B', '#7D7ECA', '#1F1F1F', '#FAFAFA'
ORDER = ['Non Demented', 'Very mild Dementia', 'Mild Dementia', 'Moderate Dementia']
CLASS_COLORS = dict(zip(ORDER, [TEAL, LAV, INDIGO, INK]))
CLASS_KEY = dict(zip(ORDER, ['nd', 'vmd', 'md', 'mod']))
CDR = {'Non Demented': 0, 'Very mild Dementia': 0.5, 'Mild Dementia': 1, 'Moderate Dementia': 2}

STATS = {'mode': MODE}   # every number the presentation needs ends up here (exported to stats.js)
print(f'Mode: {MODE} | free disk: {FREE_GB:.1f} GB | assets -> {ASSET_DIR.resolve()}')

# %%
def savefig(name, fig=None):
    (fig or plt.gcf()).tight_layout()
    plt.savefig(FIG_DIR / f'{name}.png', bbox_inches='tight')
    plt.show()

def savetab(t, name):
    t.to_csv(TAB_DIR / f'{name}.csv')
    try:
        display(t)
    except NameError:
        print(t)

def save_asset(arr, name, size=None, quality=88):
    """Save a 2D array (any range) as an 8-bit grayscale/RGB asset for the slides."""
    a = np.asarray(arr)
    if a.dtype != np.uint8:
        lo, hi = np.percentile(a, [0.5, 99.5])
        a = np.clip((a - lo) / (hi - lo + 1e-8) * 255, 0, 255).astype(np.uint8)
    im = Image.fromarray(a)
    if size:
        im = im.resize(size, Image.LANCZOS)
    path = ASSET_DIR / name
    im.save(path, quality=quality) if name.endswith('.jpg') else im.save(path, optimize=True)
    return path

def save_sprite(frames, name, size, quality=82):
    """Stack frames vertically into one JPG; the slides animate it by moving background-position."""
    w, h = size
    sheet = Image.new('L', (w, h * len(frames)))
    for i, f in enumerate(frames):
        a = np.asarray(f, dtype=np.float32)
        lo, hi = np.percentile(a, [0.5, 99.5])
        a = np.clip((a - lo) / (hi - lo + 1e-8) * 255, 0, 255).astype(np.uint8)
        sheet.paste(Image.fromarray(a).resize((w, h), Image.LANCZOS), (0, i * h))
    sheet.save(ASSET_DIR / name, quality=quality, optimize=True)
    return {'file': name, 'frames': len(frames), 'w': w, 'h': h}

# %% [markdown]
# ## 2. Data index
#
# **Full mode:** `kagglehub.dataset_download` downloads the whole dataset (cached, so re-running is instant).
#
# **Lite mode:** the list of the 86k files comes from `data/kaggle_file_listing.csv.gz` (shipped in the repository),
# from GitHub, or — as a last resort — from the public Kaggle API (≈5 min). Then a stratified sample is downloaded file by file.
#
# Either way we build the same **index table** (one row per image). The `path` column is the local file, or empty
# for images that were not downloaded (lite mode).

# %%
import kagglehub

EXTS = {'.jpg', '.jpeg', '.png'}
PAT = re.compile(r'(OAS1_\d{4})_MR(\d+)_mpr-(\d+)_(\d+)', re.IGNORECASE)
LISTING_LOCAL = Path('data/kaggle_file_listing.csv.gz')
LISTING_URL = 'https://raw.githubusercontent.com/Mmateo101/presentation-neuroimaging/main/data/kaggle_file_listing.csv.gz'

def list_from_api():
    url, tok, rows = f'https://www.kaggle.com/api/v1/datasets/list/{DATASET}', None, []
    while True:
        params = {'pageSize': 1000, **({'pageToken': tok} if tok else {})}
        r = requests.get(url, params=params, timeout=60).json()
        rows += [(f['name'], f['totalBytes']) for f in r['datasetFiles']]
        tok = r.get('nextPageTokenNullable') or r.get('nextPageToken')
        if not tok:
            return pd.DataFrame(rows, columns=['rel', 'bytes'])

def get_listing():
    cache = WORK / 'kaggle_file_listing.csv.gz'
    for src in (LISTING_LOCAL, cache):
        if src.exists():
            return pd.read_csv(src)
    try:
        lst = pd.read_csv(LISTING_URL)
    except Exception:
        print('Listing not found locally or on GitHub; asking the Kaggle API (takes a few minutes)...')
        lst = list_from_api()
    lst.to_csv(cache, index=False)
    return lst

def build_index(listing):
    rel = listing.rel.str.replace('\\', '/', regex=False)
    parts = rel.str.extract(PAT)
    df = pd.DataFrame({'rel': rel, 'file': rel.str.split('/').str[-1], 'label': rel.str.split('/').str[-2],
                       'folder': rel.str.rsplit('/', n=1).str[0],
                       'subject': parts[0], 'session': pd.to_numeric(parts[1]), 'scan': pd.to_numeric(parts[2]),
                       'slice': pd.to_numeric(parts[3]), 'bytes': listing.bytes.values})
    df = df[df.file.str.lower().str.endswith(tuple(EXTS))].reset_index(drop=True)
    labels = [c for c in ORDER if c in set(df.label)] + sorted(set(df.label) - set(ORDER))
    df['label'] = pd.Categorical(df.label, categories=labels, ordered=True)
    df['volume'] = (df.subject + '_MR' + df.session.astype('Int64').astype(str)
                    + '_mpr' + df.scan.astype('Int64').astype(str))
    df['path'] = None
    return df

if MODE == 'full':
    ROOT = Path(kagglehub.dataset_download(DATASET))
    files = [p for p in ROOT.rglob('*') if p.suffix.lower() in EXTS]
    listing = pd.DataFrame({'rel': [str(p.relative_to(ROOT)) for p in files],
                            'bytes': [p.stat().st_size for p in files]})
    df = build_index(listing)
    df['path'] = [str(ROOT / r) for r in df.rel]
else:
    df = build_index(get_listing())

print(f'Images indexed: {len(df):,}  |  file names not matching the OASIS pattern: {df.subject.isna().sum()}')
df.drop(columns='path').head()

# %% [markdown]
# **Lite mode only — stratified sample.** For every class: `LITE_FULL_SCANS_PER_CLASS` complete scans (all slices, needed
# for scan animations and slice ranking) + `LITE_RANDOM_PER_CLASS` random images. Downloads run in parallel and are cached.

# %%
def fetch(rel):
    for attempt in range(3):
        try:
            return kagglehub.dataset_download(DATASET, path=rel)
        except Exception as e:
            err = e
            time.sleep(2 * (attempt + 1))
    print('failed:', rel, err)
    return None

if MODE == 'lite':
    rng = np.random.default_rng(SEED)
    pick = []
    for c in df.label.cat.categories:
        sub = df[df.label == c]
        vols = sorted(sub.volume.unique())
        full_vols = rng.choice(vols, size=min(LITE_FULL_SCANS_PER_CLASS, len(vols)), replace=False)
        pick += sub.index[sub.volume.isin(full_vols)].tolist()
        rest = sub.index.difference(pick)
        pick += rng.choice(rest, size=min(LITE_RANDOM_PER_CLASS, len(rest)), replace=False).tolist()
    t0 = time.time()
    with ThreadPoolExecutor(12) as ex:
        paths = list(ex.map(fetch, df.loc[pick, 'rel']))
    df.loc[pick, 'path'] = paths
    print(f'Downloaded/cached {sum(p is not None for p in paths)} images in {time.time() - t0:.0f} s')

PX = df[df.path.notna()].copy()   # images available on disk for pixel-level analysis
print(f'Images available for pixel analysis: {len(PX):,} ({len(PX) / len(df):.1%} of the dataset)')

# %% [markdown]
# ## 3. (Optional) Back up to Google Drive
# Set `SAVE_TO_DRIVE = True` in Section 1 to copy the outputs to Drive at the end. The raw dataset is **not** copied
# (it is re-downloadable and Kaggle's cache makes it fast).

# %%
if IN_COLAB and SAVE_TO_DRIVE:
    from google.colab import drive
    drive.mount('/content/drive')
    Path(DRIVE_DIR).mkdir(parents=True, exist_ok=True)
    print('Drive folder ready:', DRIVE_DIR)

# %% [markdown]
# ## 4. Origin of the data
#
# **OASIS** (Open Access Series of Imaging Studies) is a public neuroimaging project from Washington University in St. Louis.
# This Kaggle dataset comes from **OASIS-1 (cross-sectional)**:
#
# - 416 subjects aged 18–96, all right-handed, men and women (436 sessions).
# - Each session has **3–4 T1-weighted MRI scans** (MP-RAGE) acquired back to back: `mpr-1`, `mpr-2`, …
# - 20 non-demented subjects were scanned a **second time** (within 90 days) to measure reliability: session `MR2`.
# - Dementia was rated with the **Clinical Dementia Rating (CDR)**. Subjects under 60 were not clinically rated.
#
# In the original release every scan is a **3D volume** (`.img/.hdr`). The Kaggle author converted the volumes into
# **2D JPG slices** and sorted them by class. Sections 10–12 and 15 check exactly what survived that conversion.

# %% [markdown]
# ## 5. Folder and file structure
# Expected: one data folder with **one sub-folder per class**; the class is given *only* by the folder name.

# %%
tree = df.groupby('folder').agg(files=('file', 'size'), size_MB=('bytes', 'sum')).sort_index()
tree['size_MB'] = (tree.size_MB / 1e6).round(1)
root_name = df.folder.str.split('/').str[0].iloc[0]
print(f'{root_name}/')
for f, r in tree.iterrows():
    print(f"    {f.split('/')[-1]}/  ({int(r.files):,} files, {r.size_MB} MB)")
ext = Counter(Path(f).suffix.lower() for f in df.file)
print('\nFile extensions:', dict(ext))
print(f'Total: {len(df):,} files, {df.bytes.sum() / 1e9:.2f} GB')
savetab(tree, '05_folder_structure')
STATS.update(n_images=int(len(df)), dataset_gb=round(df.bytes.sum() / 1e9, 2), n_classes=int(df.label.nunique()))

# %% [markdown]
# ## 6. Anatomy of a file name
#
# ```
# OAS1_0028_MR1_mpr-1_100.jpg
# │    │    │   │     └── slice number (position of the 2D image inside the 3D scan)
# │    │    │   └──────── scan number inside the session (repeated T1 acquisition)
# │    │    └──────────── session (MR1 = first visit, MR2 = reliability re-scan)
# │    └───────────────── subject ID
# └────────────────────── OASIS-1 project
# ```
# Every file name was parsed in Section 2. A `volume` id (subject + session + scan) groups all slices of one 3D scan.

# %%
df[['file', 'label', 'subject', 'session', 'scan', 'slice', 'volume']].sample(8, random_state=SEED)

# %% [markdown]
# ## 7. Labels
#
# | Folder (label) | CDR | Clinical meaning |
# |---|---|---|
# | Non Demented | 0 | No dementia |
# | Very mild Dementia | 0.5 | Questionable / very mild impairment |
# | Mild Dementia | 1 | Mild dementia |
# | Moderate Dementia | 2 | Moderate dementia |
#
# We count **images** and **people** separately: each person contributes hundreds of slices, so the number of people
# is the real size of each class.

# %%
lab = df.groupby('label', observed=True).agg(images=('file', 'size'), subjects=('subject', 'nunique'),
                                             scans=('volume', 'nunique'))
lab.insert(0, 'CDR', [CDR.get(c) for c in lab.index])
lab['images_%'] = (100 * lab.images / lab.images.sum()).round(2)
lab['subjects_%'] = (100 * lab.subjects / lab.subjects.sum()).round(2)
lab['images_per_subject'] = (lab.images / lab.subjects).round(1)
lab['ratio_vs_largest'] = (lab.images.max() / lab.images).round(1)
savetab(lab, '07_labels')

fig, ax = plt.subplots(1, 2, figsize=(12, 4))
cols = [CLASS_COLORS.get(c, 'gray') for c in lab.index]
lab.images.plot.bar(ax=ax[0], color=cols, title='Images per class')
lab.subjects.plot.bar(ax=ax[1], color=cols, title='Subjects (people) per class')
for a, col in zip(ax, ['images', 'subjects']):
    a.tick_params(axis='x', rotation=15)
    for i, v in enumerate(lab[col]):
        a.text(i, v, f'{v:,}', ha='center', va='bottom', fontsize=8)
savefig('07_labels')

n_lab = df.groupby('subject').label.nunique()
print(f'Subjects with more than one label: {(n_lab > 1).sum()} of {len(n_lab)}')
print(f'Largest class has {lab.ratio_vs_largest.max():.0f}x more images than the smallest one.')
STATS['classes'] = [{'label': c, 'key': CLASS_KEY.get(c, c), 'cdr': CDR.get(c), 'images': int(r.images),
                     'subjects': int(r.subjects), 'scans': int(r.scans)} for c, r in lab.iterrows()]
STATS['imbalance_ratio'] = float(lab.ratio_vs_largest.max())

# %% [markdown]
# ## 8. Subjects, sessions and scans
# Hierarchy: **subject → session (MR1/MR2) → scan (mpr-1…4) → slices**.

# %%
sess = df.groupby(['label', 'session'], observed=True).subject.nunique().unstack(fill_value=0)
sess.columns = [f'subjects_with_MR{c}' for c in sess.columns]
savetab(sess, '08_sessions')

per_subj = df.groupby('subject').agg(label=('label', 'first'), sessions=('session', 'nunique'),
                                     scans=('volume', 'nunique'), slices=('file', 'size'))
scans_dist = per_subj.scans.value_counts().sort_index()
savetab(scans_dist.rename_axis('scans_per_subject').to_frame('n_subjects'), '08_scans_per_subject')

fig, ax = plt.subplots(1, 2, figsize=(12, 4))
per_subj.slices.plot.hist(bins=30, ax=ax[0], color=TEAL, title='Images contributed per subject')
ax[0].set_xlabel('number of images')
scans_dist.plot.bar(ax=ax[1], color=INDIGO, rot=0, title='Scans (3D volumes) per subject')
ax[1].set_xlabel('number of scans')
savefig('08_subject_hierarchy')
STATS.update(n_subjects=int(df.subject.nunique()), n_scans=int(df.volume.nunique()),
             n_subjects_mr2=int(df[df.session == 2].subject.nunique()),
             images_per_subject_median=float(per_subj.slices.median()),
             scans_per_subject={str(k): int(v) for k, v in scans_dist.items()})

# %% [markdown]
# ## 9. Clinical table: who are these people?
#
# The OASIS-1 spreadsheet has one row per session with **age, sex, education, MMSE** (cognitive test, 0–30),
# **CDR**, **eTIV** (intracranial volume) and **nWBV** (normalized whole-brain volume). Joining it with the Kaggle labels
# tells us whether the classes differ in things *other than dementia* — e.g. age. A model can learn those shortcuts.

# %%
CLIN_URL = 'https://sites.wustl.edu/oasisbrains/files/2024/04/oasis_cross-sectional-5708aa0a98d82080.xlsx'
clin_file = WORK / 'oasis_cross_sectional.xlsx'
if not clin_file.exists():
    clin_file.write_bytes(requests.get(CLIN_URL, timeout=60).content)
clin = pd.read_excel(clin_file)
clin['subject'] = clin.ID.str[:9]
clin1 = clin[clin.ID.str.endswith('MR1')].set_index('subject')

subj = per_subj.join(clin1[['M/F', 'Age', 'MMSE', 'CDR', 'nWBV', 'eTIV']], how='left')
summ = subj.groupby('label', observed=True).agg(
    subjects=('sessions', 'size'), age_mean=('Age', 'mean'), age_min=('Age', 'min'), age_max=('Age', 'max'),
    female_pct=('M/F', lambda s: 100 * (s == 'F').mean()), mmse_mean=('MMSE', 'mean'),
    nwbv_mean=('nWBV', 'mean'), cdr_missing=('CDR', lambda s: int(s.isna().sum()))).round(2)
savetab(summ, '09_clinical_by_class')

nd = subj[subj.label == 'Non Demented']
print(f"'Non Demented' subjects without any clinical rating (CDR missing): {nd.CDR.isna().sum()} of {len(nd)}")
print(f"Their ages: {nd[nd.CDR.isna()].Age.min()}–{nd[nd.CDR.isna()].Age.max()}  vs. rated subjects: "
      f"{subj[subj.CDR.notna()].Age.min()}–{subj[subj.CDR.notna()].Age.max()}")

fig, ax = plt.subplots(1, 2, figsize=(13, 4.2))
for c in subj.label.cat.categories:
    s = subj[subj.label == c]
    ax[0].hist(s.Age.dropna(), bins=np.arange(15, 100, 5), alpha=.75, label=c, color=CLASS_COLORS.get(c))
    ax[1].scatter(s.Age, s.nWBV, s=14, alpha=.8, label=c, color=CLASS_COLORS.get(c))
ax[0].set(title='Age per class', xlabel='age (years)', ylabel='subjects'); ax[0].legend(fontsize=8)
ax[1].set(title='Brain volume shrinks with age and dementia', xlabel='age (years)', ylabel='nWBV')
savefig('09_age_nwbv')

STATS['clinical'] = [{'label': c, 'age_mean': float(r.age_mean), 'age_min': float(r.age_min), 'age_max': float(r.age_max),
                      'mmse_mean': None if pd.isna(r.mmse_mean) else float(r.mmse_mean),
                      'nwbv_mean': float(r.nwbv_mean), 'female_pct': float(r.female_pct),
                      'cdr_missing': int(r.cdr_missing)} for c, r in summ.iterrows()]
STATS['nd_unrated'] = int(nd.CDR.isna().sum())
STATS['nd_total'] = int(len(nd))
STATS['scatter'] = [[int(r.Age), round(float(r.nWBV), 3), CLASS_KEY.get(r.label, ''), int(pd.isna(r.CDR))]
                    for _, r in subj.dropna(subset=['Age', 'nWBV']).iterrows()]

# %% [markdown]
# ## 10. Technical format of the images
# Dimensions, color mode (`L` = grayscale, `RGB` = 3 channels), value range and file size, on a sample.
# If the files are RGB we check whether the three channels are identical (grayscale stored as color).

# %%
sample = PX.sample(min(3000, len(PX)), random_state=SEED)
info = []
for p in sample.path:
    with Image.open(p) as im:
        a = np.asarray(im)
        same = bool(a.ndim == 3 and np.array_equal(a[..., 0], a[..., 1]) and np.array_equal(a[..., 1], a[..., 2]))
        info.append({'width': im.width, 'height': im.height, 'mode': im.mode, 'format': im.format,
                     'min': int(a.min()), 'max': int(a.max()), 'rgb_identical': same if a.ndim == 3 else None})
info = pd.DataFrame(info)
mc = Counter(zip(info.width, info.height)).most_common(1)[0][0]
fmt = pd.Series({
    'images inspected': len(info),
    'dimensions (W x H)': dict(Counter(zip(info.width, info.height)).most_common(3)),
    'color modes': dict(info['mode'].value_counts()),
    'file format': dict(info.format.value_counts()),
    'pixel range': f"{info['min'].min()} – {info['max'].max()}",
    'RGB with identical channels': info.rgb_identical.dropna().mean() if info.rgb_identical.notna().any() else 'n/a',
    'median file size (KB)': round(df.bytes.median() / 1e3, 1),
}, name='value').to_frame()
savetab(fmt, '10_image_format')

df.bytes.div(1e3).plot.hist(bins=50, color=TEAL, title='File size distribution (all images)')
plt.xlabel('KB')
savefig('10_file_size')
STATS.update(img_w=int(mc[0]), img_h=int(mc[1]), img_mode=str(info['mode'].mode()[0]),
             img_kb_median=round(df.bytes.median() / 1e3, 1))

# %% [markdown]
# ## 11. What the images look like
# **11.1 Random examples per class.** Look for: plane of the cut, skull, background, ventricle size.

# %%
def load(p, size=None):
    im = Image.open(p).convert('L')
    return np.asarray(im.resize(size) if size else im, dtype=np.float32)

n = 6
fig, ax = plt.subplots(len(ORDER), n, figsize=(2.6 * n, 1.6 * len(ORDER)))
for i, c in enumerate(ORDER):
    pool = PX[PX.label == c]
    pick = pool.sample(min(n, len(pool)), random_state=SEED)
    for j in range(n):
        a = ax[i, j]; a.set_xticks([]); a.set_yticks([])
        if j < len(pick):
            a.imshow(load(pick.path.iloc[j]), cmap='gray')
            a.set_title(f'{pick.subject.iloc[j]} s{pick.slice.iloc[j]}', fontsize=7)
    ax[i, 0].set_ylabel(c, fontsize=8)
savefig('11_examples_per_class')

# %% [markdown]
# **11.2 One complete scan, slice by slice** — and the scan animations used in the presentation
# (one complete scan per class exported as a vertical sprite).

# %%
complete = PX.groupby('volume').size()
complete = complete[complete == df.groupby('volume').size().reindex(complete.index)].index
vol_label = df.drop_duplicates('volume').set_index('volume').label
scan_by_class = {c: sorted(v for v in complete if vol_label[v] == c)[0]
                 for c in ORDER if any(vol_label[v] == c for v in complete)}
example_vol = scan_by_class.get('Non Demented', next(iter(scan_by_class.values())))

def scan_paths(vol):
    return df[(df.volume == vol) & df.path.notna()].sort_values('slice')

s = scan_paths(example_vol)
pick = s.iloc[np.linspace(0, len(s) - 1, min(30, len(s))).astype(int)]
fig, ax = plt.subplots(3, 10, figsize=(16, 3.4))
for a in ax.ravel(): a.axis('off')
for a, (_, r) in zip(ax.ravel(), pick.iterrows()):
    a.imshow(load(r.path), cmap='gray'); a.set_title(f's{r.slice}', fontsize=7)
fig.suptitle(f'{example_vol} ({vol_label[example_vol]})', fontsize=10)
savefig('11_one_scan_all_slices')

STATS['scan_sprites'] = {}
for c, v in scan_by_class.items():
    frames = [load(p) for p in scan_paths(v).path]
    meta = save_sprite(frames, f'scan_{CLASS_KEY[c]}.jpg', (372, 186))
    meta.update(volume=v, label=c, first_slice=int(scan_paths(v).slice.min()))
    STATS['scan_sprites'][CLASS_KEY[c]] = meta
print('Scan sprites:', {k: v['volume'] for k, v in STATS['scan_sprites'].items()})

# %% [markdown]
# **11.3 Same slice position across classes** — exported as one image per class for the slides.

# %%
mid = int(df.slice.median())
fig, ax = plt.subplots(1, len(scan_by_class), figsize=(3.4 * len(scan_by_class), 2.2))
for a, (c, v) in zip(np.ravel(ax), scan_by_class.items()):
    r = scan_paths(v).set_index('slice').loc[mid]
    img = load(r.path)
    a.imshow(img, cmap='gray'); a.axis('off'); a.set_title(f'{c}\n{v}, slice {mid}', fontsize=8)
    save_asset(img.astype(np.uint8), f'class_{CLASS_KEY[c]}.jpg')
savefig('11_same_slice_across_classes')

# %% [markdown]
# ## 12. Do the images represent full 3D brains? (slice coverage)
#
# Per scan: first/last slice number, number of slices and internal gaps. Then a *presence map*
# (rows = scans, columns = slice numbers). This uses the complete index, so it is exact in both modes.

# %%
vol = (df.groupby(['volume', 'label'], observed=True).slice
         .agg(first_slice='min', last_slice='max', n_slices='count').reset_index())
vol['span'] = vol.last_slice - vol.first_slice + 1
vol['gaps'] = vol.span - vol.n_slices
cov = vol.groupby('label', observed=True)[['first_slice', 'last_slice', 'n_slices', 'gaps']].agg(['min', 'median', 'max'])
savetab(cov, '12_slice_coverage_by_class')

common = vol.groupby(['first_slice', 'last_slice']).size().sort_values(ascending=False)
print(f'Scans: {len(vol):,}')
print(f'Slice numbers present in the whole dataset: {int(df.slice.min())} – {int(df.slice.max())}')
print(f'{common.iloc[0] / len(vol):.1%} of scans share the range {common.index[0]}')
print(f'Scans with internal gaps: {(vol.gaps > 0).mean():.1%}')

vs = vol.sort_values(['label', 'volume']).groupby('label', observed=True, group_keys=False).head(75)
s_min, s_max = 0, 255
M = np.zeros((len(vs), s_max - s_min + 1), dtype=np.uint8)
present = df[df.volume.isin(vs.volume)].groupby('volume').slice.apply(set)
for i, v in enumerate(vs.volume):
    for sl in present[v]:
        M[i, int(sl) - s_min] = 1
fig, ax = plt.subplots(figsize=(12, 4.5))
ax.imshow(M, aspect='auto', cmap='gray', interpolation='nearest', extent=[s_min - .5, s_max + .5, len(vs), 0])
for b in np.cumsum(vs.label.value_counts(sort=False).reindex(vs.label.cat.categories).fillna(0).values)[:-1]:
    ax.axhline(b, color='red', lw=1)
ax.set(xlabel='slice number (0–255 = whole head along this axis)', ylabel='scans (grouped by class)',
       title='Which slice numbers exist for each scan (white = present)')
savefig('12_presence_map')
STATS.update(slice_min=int(df.slice.min()), slice_max=int(df.slice.max()),
             slices_per_scan=int(vol.n_slices.median()), scans_with_gaps=float((vol.gaps > 0).mean()))

# %% [markdown]
# **12.2 Amount of tissue per slice position.** If the curve does not drop to ~0 at both ends, the kept band is only
# the middle of the head.

# %%
area = []
for v in list(complete)[:12]:
    for _, r in scan_paths(v).iterrows():
        area.append({'label': r.label, 'slice': r.slice, 'tissue_%': 100 * (load(r.path, (124, 62)) > 15).mean()})
area = pd.DataFrame(area)
fig, ax = plt.subplots(figsize=(10, 3.6))
for c, g_ in area.groupby('label', observed=True):
    m = g_.groupby('slice')['tissue_%'].mean()
    ax.plot(m.index, m.values, label=c, color=CLASS_COLORS.get(c))
ax.set(xlabel='slice number', ylabel='% tissue pixels', title='Tissue visible per slice position'); ax.legend(fontsize=8)
savefig('12_tissue_vs_slice')

# %% [markdown]
# ## 13. Intensity and appearance by class
# Tissue histograms, mean/contrast/background per class, the **average image** per class and its difference with
# *Non Demented* (red = brighter, blue = darker).

# %%
stats_rows, means = [], {}
fig, ax = plt.subplots(figsize=(9, 3.6))
for c in ORDER:
    pool = PX[PX.label == c]
    if pool.empty:
        continue
    sub = pool.sample(min(400, len(pool)), random_state=SEED)
    imgs = np.stack([load(p, (248, 124)) for p in sub.path])
    means[c] = imgs.mean(0)
    fg = imgs[imgs > 15]
    stats_rows.append({'label': c, 'n_images': len(sub), 'mean_intensity': imgs.mean(), 'contrast_std': imgs.std(),
                       'background_%': 100 * (imgs <= 15).mean(), 'tissue_mean': fg.mean(), 'tissue_std': fg.std()})
    ax.hist(fg.ravel()[::20], bins=80, density=True, histtype='step', label=c, color=CLASS_COLORS[c], lw=1.6)
ax.set(title='Tissue intensity distribution per class', xlabel='pixel value'); ax.legend(fontsize=8)
savefig('13_intensity_hist')
savetab(pd.DataFrame(stats_rows).set_index('label').round(2), '13_intensity_stats')

ref = means[ORDER[0]]
fig, ax = plt.subplots(2, len(means), figsize=(3.4 * len(means), 3.6))
for i, (c, m) in enumerate(means.items()):
    ax[0, i].imshow(m, cmap='gray'); ax[0, i].set_title(f'Average: {c}', fontsize=8)
    d = m - ref; v = np.abs(d).max() or 1
    ax[1, i].imshow(d, cmap='seismic', vmin=-v, vmax=v); ax[1, i].set_title(f'{c} − {ORDER[0]}', fontsize=8)
for a in ax.ravel(): a.axis('off')
savefig('13_average_images')

# %% [markdown]
# ## 14. Duplicates, near-duplicates and data leakage
#
# - **Exact duplicates:** identical bytes (MD5) in a sample.
# - **Near duplicates:** correlation between *adjacent* slices of the same scan vs. random pairs.
# - **Leakage:** if images are split at random into train/test, slices of the *same person* land on both sides and the
#   model can recognise the person instead of the disease. We measure how often that happens.

# %%
hs = PX.sample(min(5000, len(PX)), random_state=SEED)
hashes = hs.path.map(lambda p: hashlib.md5(Path(p).read_bytes()).hexdigest())
print(f'Exact duplicate files in a sample of {len(hs):,}: {hashes.duplicated().sum()}')

def corr(a, b):
    a, b = a.ravel() - a.mean(), b.ravel() - b.mean()
    return float((a @ b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))

adj = []
for v in complete:
    imgs = [load(p, (124, 62)) for p in scan_paths(v).path]
    adj += [corr(imgs[k], imgs[k + 1]) for k in range(len(imgs) - 1)]
rng = np.random.default_rng(SEED)
rand = [corr(load(a, (124, 62)), load(b, (124, 62))) for a, b in rng.choice(PX.path.values, size=(len(adj), 2))]

plt.figure(figsize=(8, 3.4))
plt.hist(adj, bins=40, alpha=.8, color=TEAL, label=f'adjacent slices (median {np.median(adj):.3f})')
plt.hist(rand, bins=40, alpha=.8, color=LAV, label=f'random pairs (median {np.median(rand):.3f})')
plt.xlabel('Pearson correlation'); plt.legend(); plt.title('Similarity between images')
savefig('14_near_duplicates')

# Leakage: random 80/20 split of images vs. split by subject
rng = np.random.default_rng(SEED)
is_test = rng.random(len(df)) < 0.2
train_subj = set(df.subject[~is_test])
leak = df[is_test].subject.isin(train_subj).mean()
print(f'Random image split: {leak:.1%} of test images belong to a person also present in training.')
mod_subj = df[df.label == 'Moderate Dementia'].subject.nunique()
print(f"'Moderate Dementia' has {mod_subj} subjects: a subject-level split leaves at most {mod_subj - 1} for training.")
STATS.update(exact_duplicates=int(hashes.duplicated().sum()), adj_corr_median=round(float(np.median(adj)), 3),
             rand_corr_median=round(float(np.median(rand)), 3), leak_random_split=round(float(leak), 4))

# %% [markdown]
# ## 15. The original 3D volume — and where the Kaggle JPGs come from
#
# The OASIS-1 discs are 1.4 GB each, but a `.tar.gz` can be **streamed**: we read the archive sequentially and stop
# as soon as the first subject (`OAS1_0001_MR1`) is complete, so only ~115 MB are downloaded. We keep:
#
# | File | Meaning |
# |---|---|
# | `RAW/..._mpr-1_anon.img` | raw scan as acquired (256 × 256 × 128, sagittal, 1 × 1 × 1.25 mm) |
# | `T88_111/..._t88_gfc.img` | **gain-field (bias) corrected** and registered to the Talairach atlas (176 × 208 × 176, 1 mm) |
# | `T88_111/..._t88_masked_gfc.img` | the same, **skull-stripped** (brain mask applied) |
# | `FSL_SEG/..._fseg.img` | tissue **segmentation** with FSL FAST: 1 = CSF, 2 = gray matter, 3 = white matter |

# %%
import nibabel as nib

RAW_URL = 'https://download.nrg.wustl.edu/data/oasis_cross-sectional_disc1.tar.gz'
RAW_DIR = WORK / 'oasis_raw'
KEEP = ('mpr-1_anon.img', 'mpr-1_anon.hdr', 't88_gfc.img', 't88_gfc.hdr', 't88_masked_gfc.img',
        't88_masked_gfc.hdr', 'fseg.img', 'fseg.hdr')

def stream_first_subject(url=RAW_URL, out=RAW_DIR):
    out.mkdir(parents=True, exist_ok=True)
    if sum(1 for f in out.iterdir() if f.name.endswith(KEEP)) >= len(KEEP):
        return sorted(out.iterdir())
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        r.raw.decode_content = True
        with tarfile.open(fileobj=r.raw, mode='r|gz') as tar:
            first = None
            for m in tar:
                parts = m.name.split('/')
                if len(parts) > 1 and parts[1].startswith('OAS1'):
                    first = first or parts[1]
                    if parts[1] != first:
                        break                       # first subject complete -> stop downloading
                if m.isfile() and m.name.endswith(KEEP):
                    (out / Path(m.name).name).write_bytes(tar.extractfile(m).read())
    return sorted(out.iterdir())

t0 = time.time()
files = stream_first_subject()
print(f'{len(files)} files ready in {time.time() - t0:.0f} s:', [f.name for f in files])

def vol_of(suffix):
    f = next(f for f in RAW_DIR.iterdir() if f.name.endswith(suffix))
    return np.asarray(nib.load(str(f)).dataobj)[..., 0].astype(np.float32)

raw = vol_of('mpr-1_anon.img')
gfc = vol_of('t88_gfc.img')
masked = vol_of('t88_masked_gfc.img')
fseg = vol_of('fseg.img').astype(np.uint8)
for name, v in [('raw', raw), ('gfc', gfc), ('masked', masked), ('fseg', fseg)]:
    print(f'{name:7s} shape={v.shape}  range={v.min():.0f}–{v.max():.0f}')
STATS.update(raw_shape=list(raw.shape), t88_shape=list(gfc.shape))

# %% [markdown]
# **15.1 The three anatomical planes** (atlas-registered volume, so all three are correctly oriented).
# The sweeps are exported as sprites: the slides animate them like a scanner moving through the head.

# %%
ax_ = lambda v, z: np.rot90(v[:, :, z])      # axial: seen from above
cor_ = lambda v, y: np.rot90(v[:, y, :])     # coronal: seen from the front
sag_ = lambda v, x: np.rot90(v[x, :, :])     # sagittal: seen from the side

fig, ax = plt.subplots(1, 3, figsize=(13, 4.4))
for a, (t, im) in zip(ax, [('Axial', ax_(gfc, 95)), ('Coronal', cor_(gfc, 110)), ('Sagittal', sag_(gfc, 88))]):
    a.imshow(im, cmap='gray'); a.set_title(t); a.axis('off')
savefig('15_three_planes')

def nonempty(v, axis):
    prof = (v > np.percentile(v, 60)).sum(axis=tuple(i for i in range(3) if i != axis))
    idx = np.where(prof > prof.max() * 0.03)[0]
    return idx.min(), idx.max()

STATS['plane_sprites'] = {}
for name, fn, axis, size in [('axial', ax_, 2, (176, 208)), ('coronal', cor_, 1, (176, 176)), ('sagittal', sag_, 0, (208, 176))]:
    lo, hi = nonempty(gfc, axis)
    idx = np.linspace(lo, hi, 60).astype(int)
    STATS['plane_sprites'][name] = save_sprite([fn(gfc, i) for i in idx], f'plane_{name}.jpg', size)

# %% [markdown]
# **15.2 Where does each Kaggle JPG come from?** We take the Kaggle image `OAS1_0001_MR1_mpr-1_<slice>.jpg`
# and compare it (correlation) with every slice of the raw volume along each of the three axes and 8 orientations.
# The best match tells us which axis the Kaggle author cut and whether the slice number is the raw index.

# %%
k_rel = df[(df.volume == 'OAS1_0001_MR1_mpr1') & (df.slice == 130)].rel.iloc[0]
k_full = Image.open(fetch(k_rel) if MODE == 'lite' else df.loc[df.rel == k_rel, 'path'].iloc[0]).convert('L')
k_img = np.asarray(k_full.resize((128, 64)), dtype=np.float32)

def orient(s, t):
    """One of the 8 rotations/flips of a 2D slice (or of a stack of slices along the last two axes)."""
    s = np.rot90(s, t % 4, axes=(-2, -1))
    return s[..., ::-1] if t >= 4 else s

best = []
for axis in range(3):
    V = np.moveaxis(raw, axis, 0)[:, ::2, ::2]          # all slices along this axis, 2x downsampled
    for t in range(8):
        S = orient(V, t)
        h, w = S.shape[1:]
        kk = np.asarray(k_full.resize((w, h)), dtype=np.float32).ravel()
        kz = (kk - kk.mean()) / (kk.std() + 1e-8)
        S = S.reshape(len(S), -1)
        Sz = (S - S.mean(1, keepdims=True)) / (S.std(1, keepdims=True) + 1e-8)
        r = Sz @ kz / kz.size                             # correlation of the Kaggle JPG with every slice
        best.append((float(r.max()), axis, t, int(r.argmax()), r))
best.sort(key=lambda b: -b[0])
score, axis_k, t_k, idx_k, curve = best[0]
print(f'Best match: axis {axis_k}, orientation {t_k}, raw slice index {idx_k} (Kaggle says 130), r = {score:.3f}')

plt.figure(figsize=(9, 3))
plt.plot(curve, color=TEAL); plt.axvline(130, color=INDIGO, ls='--', label='Kaggle slice number')
plt.xlabel(f'raw slice index along axis {axis_k}'); plt.ylabel('correlation'); plt.legend()
plt.title('Kaggle JPG vs every slice of the raw scan')
savefig('15_kaggle_slice_match')

fig, ax = plt.subplots(1, 2, figsize=(10, 3))
ax[0].imshow(k_img, cmap='gray'); ax[0].set_title('Kaggle JPG, slice 130')
ax[1].imshow(orient(np.take(raw, idx_k, axis=axis_k), t_k), cmap='gray', aspect='auto')
ax[1].set_title(f'raw volume, axis {axis_k}, index {idx_k}')
for a in ax: a.axis('off')
savefig('15_kaggle_vs_raw')

# Raw head sweep along the Kaggle axis, highlighting the band that Kaggle kept (for the slides)
n_ax = raw.shape[axis_k]
idx = np.arange(0, n_ax, 3)
STATS['raw_sweep'] = save_sprite([orient(np.take(raw, i, axis=axis_k), t_k) for i in idx], 'raw_sweep.jpg', (256, 128))
STATS['raw_sweep'].update(indices=idx.tolist(), axis_len=int(n_ax), match_index=idx_k, match_r=round(score, 3))
mid_raw = orient(np.take(raw, raw.shape[axis_k] // 2, axis=axis_k), t_k)
save_asset(mid_raw, 'raw_mid.jpg', (512, 256))
# A sagittal cut of the raw head (perpendicular to the Kaggle cuts) with the kept band marked.
# Rows = Kaggle slice index; OASIS raw scans store the head upside down along this axis, so we flip it.
others = [a for a in range(3) if a != axis_k]
perp_axis = min(others, key=lambda a: raw.shape[a])           # the short (left-right) axis -> sagittal view
perp = np.take(raw, raw.shape[perp_axis] // 2, axis=perp_axis)
if perp_axis < axis_k:
    perp = perp.T
perp = np.flipud(perp)
band = (n_ax - 1 - int(df.slice.max()), n_ax - 1 - int(df.slice.min()))   # rows of the kept band after the flip
save_asset(perp, 'raw_perp.jpg')
STATS['raw_perp'] = {'h': int(perp.shape[0]), 'w': int(perp.shape[1]), 'band_rows': list(band)}

plt.figure(figsize=(4, 4))
plt.imshow(perp, cmap='gray'); plt.axhspan(*band, color=TEAL, alpha=.35)
plt.title(f'Kaggle kept slices {int(df.slice.min())}–{int(df.slice.max())} of {n_ax}'); plt.axis('off')
savefig('15_kept_band')

# %% [markdown]
# ## 16. Technique 1 — Bias field correction (N4)
#
# MRI scanners add a smooth, low-frequency **multiplicative** brightness field: the same tissue looks brighter on
# one side of the head than on the other. Model: `observed = true × bias + noise`. N4 (Tustison 2010) estimates
# `log(bias)` with B-splines by iteratively sharpening the intensity histogram, then divides it out.
#
# Demo (2D, so the effect is easy to see): take a bias-corrected slice, multiply a known smooth field, and let N4
# recover it. Then we run N4 on the real raw 3D scan.

# %%
import SimpleITK as sitk

clean = np.rot90(gfc[:, :, 95]).astype(np.float32)
H, W = clean.shape
yy, xx = np.mgrid[0:H, 0:W]
true_field = 0.55 + 0.9 * np.exp(-(((xx - 0.15 * W) / (0.75 * W)) ** 2 + ((yy - 0.2 * H) / (0.8 * H)) ** 2))
corrupt = clean * true_field

img = sitk.GetImageFromArray(corrupt)
mask = sitk.OtsuThreshold(img, 0, 1, 200)
n4 = sitk.N4BiasFieldCorrectionImageFilter()
n4.SetMaximumNumberOfIterations([60, 60, 40, 30])
n4.Execute(img, mask)
log_field = sitk.GetArrayFromImage(n4.GetLogBiasFieldAsImage(img))
est_field = np.exp(log_field)
corrected = corrupt / est_field

m = sitk.GetArrayFromImage(mask).astype(bool)
wm = m & (np.rot90(fseg[:, :, 95]) == 3)          # white-matter pixels: should all have the same brightness

def cv(a):
    return float(a[wm].std() / a[wm].mean())

print(f'White-matter coefficient of variation: clean {cv(clean):.3f} | with bias {cv(corrupt):.3f} | after N4 {cv(corrected):.3f}')

fig, ax = plt.subplots(1, 4, figsize=(15, 3.8))
for a, (t, im, cm) in zip(ax, [('Clean', clean, 'gray'), ('+ bias field', corrupt, 'gray'),
                               ('Field estimated by N4', est_field, 'magma'), ('Corrected', corrected, 'gray')]):
    a.imshow(im, cmap=cm); a.set_title(t); a.axis('off')
savefig('16_bias_field_demo')

row = H // 2
prof = lambda a: (a[row] / np.percentile(clean[m], 99)).round(3).tolist()
vmax = np.percentile(corrupt[m], 99.5)
for nm, a in [('bias_clean', clean), ('bias_corrupt', corrupt), ('bias_corrected', corrected)]:
    save_asset(np.clip(a / vmax * 255, 0, 255).astype(np.uint8), f'{nm}.png')
f8 = (plt.cm.magma((est_field - est_field.min()) / (np.ptp(est_field) + 1e-8))[..., :3] * 255).astype(np.uint8)
Image.fromarray(f8).save(ASSET_DIR / 'bias_field.png')
STATS['bias'] = {'row': int(row), 'h': int(H), 'w': int(W), 'profile_corrupt': prof(corrupt),
                 'profile_corrected': prof(corrected), 'profile_clean': prof(clean),
                 'cv_clean': round(cv(clean), 3), 'cv_corrupt': round(cv(corrupt), 3), 'cv_corrected': round(cv(corrected), 3)}

# %% [markdown]
# **N4 on the real raw scan (3D).** To keep it fast the field is estimated on a 4× downsampled volume and then
# evaluated at full resolution.

# %%
t0 = time.time()
img3 = sitk.GetImageFromArray(raw)
mask3 = sitk.OtsuThreshold(img3, 0, 1, 200)
small, smask = sitk.Shrink(img3, [4] * 3), sitk.Shrink(mask3, [4] * 3)
n4_3 = sitk.N4BiasFieldCorrectionImageFilter()
n4_3.SetMaximumNumberOfIterations([50, 40, 30])
n4_3.Execute(small, smask)
field3 = np.exp(sitk.GetArrayFromImage(n4_3.GetLogBiasFieldAsImage(img3)))
m3 = sitk.GetArrayFromImage(mask3).astype(bool)
print(f'N4 on the raw volume took {time.time() - t0:.0f} s; field ranges {field3[m3].min():.2f}–{field3[m3].max():.2f} '
      f'(= {100 * (field3[m3].max() / field3[m3].min() - 1):.0f}% brightness difference across the head)')
STATS['bias']['raw_field_pct'] = round(float(100 * (field3[m3].max() / field3[m3].min() - 1)), 1)

# %% [markdown]
# ## 17. Technique 2 — Skull stripping
#
# Removes skull, scalp, eyes and neck so only brain remains. A classic, transparent algorithm (each step is exported
# for the slide animation):
#
# 1. **Threshold** (70% of Otsu): separate tissue from background.
# 2. **Erode**: cut the thin bridges that connect brain and skull.
# 3. **Largest connected component**: keep the brain, drop the skull pieces.
# 4. **Dilate + fill holes**: recover the eroded border and fill the ventricles.
# 5. **Apply the mask.**
#
# We compare our mask with the official OASIS brain mask using the **Dice** coefficient (1 = identical).
# It works well in mid-brain slices but fails near the eyes and neck, where tissue touches the brain — which is why
# real pipelines use 3D atlas-based or learned tools (FreeSurfer, HD-BET, SynthStrip).

# %%
from scipy import ndimage as ndi
from skimage.filters import threshold_otsu
from skimage.morphology import disk

def skull_strip(sl, frac=0.7, r_erode=4, r_dilate=6):
    """Classic 2D skull stripping on one slice; returns every intermediate mask."""
    th = sl > threshold_otsu(sl) * frac                     # 1. tissue vs background
    er = ndi.binary_erosion(th, structure=disk(r_erode))     # 2. cut thin brain-skull bridges
    lab_, n_ = ndi.label(er)
    if n_ == 0:
        empty = np.zeros_like(th)
        return {'threshold': th, 'eroded': er, 'component': empty, 'mask': empty}
    cc = lab_ == (np.argmax(ndi.sum(er, lab_, range(1, n_ + 1))) + 1)   # 3. largest piece = brain
    mask = ndi.binary_fill_holes(ndi.binary_dilation(cc, structure=disk(r_dilate)))  # 4. regrow + fill
    return {'threshold': th, 'eroded': er, 'component': cc, 'mask': mask}

dice = lambda a, b: float(2 * (a & b).sum() / (a.sum() + b.sum() + 1e-8))
truth = masked > 0

z = 100
sl = np.rot90(gfc[:, :, z])
steps = skull_strip(sl)
truth_sl = np.rot90(truth[:, :, z])
print(f'Dice on slice {z}: {dice(steps["mask"], truth_sl):.3f}')

# Same recipe slice by slice over the whole head: it works mid-brain and fails near the eyes and neck
mask3 = np.zeros_like(truth)
for k in range(gfc.shape[2]):
    if (gfc[:, :, k] > 0).mean() > 0.05:
        mask3[:, :, k] = skull_strip(gfc[:, :, k])['mask']
per_slice = [dice(mask3[:, :, k], truth[:, :, k]) for k in range(gfc.shape[2]) if truth[:, :, k].any()]
print(f'Whole volume Dice: {dice(mask3, truth):.3f} | slices with Dice > 0.9: {np.mean(np.array(per_slice) > 0.9):.0%}')

fig, ax = plt.subplots(1, 6, figsize=(18, 3.4))
panels = [('Input', sl), ('1. Otsu threshold', steps['threshold']), ('2. Erosion', steps['eroded']),
          ('3. Largest component', steps['component']), ('4. Dilate + fill', steps['mask']),
          ('5. Brain only', sl * steps['mask'])]
for a, (t, im) in zip(ax, panels):
    a.imshow(im, cmap='gray'); a.set_title(t, fontsize=9); a.axis('off')
savefig('17_skull_stripping_steps')

vmax = np.percentile(sl, 99.5)
to8 = lambda a: np.clip(a / vmax * 255, 0, 255).astype(np.uint8)
for i, (t, im) in enumerate(panels):
    save_asset(to8(im) if im.dtype != bool else (im * 255).astype(np.uint8), f'skull_{i}.png')
# Official OASIS mask drawn as a teal outline (transparent PNG) to overlay on our result
edge = truth_sl & ~ndi.binary_erosion(truth_sl, iterations=2)
outline = np.zeros(edge.shape + (4,), np.uint8)
outline[edge] = [0, 112, 111, 255]
Image.fromarray(outline).save(ASSET_DIR / 'skull_truth.png')
STATS['skull'] = {'dice_2d': round(dice(steps['mask'], truth_sl), 3), 'dice_3d': round(dice(mask3, truth), 3),
                  'slices_ok_pct': round(float(100 * np.mean(np.array(per_slice) > 0.9)), 1),
                  'removed_pct': round(float(100 * (1 - truth.sum() / (gfc > threshold_otsu(gfc[gfc > 0])).sum())), 1)}

# %% [markdown]
# ## 18. Technique 3 — Segmentation (what FreeSurfer gives you)
#
# FreeSurfer (`recon-all`) does skull stripping, bias correction, registration, **tissue segmentation** and
# **cortical parcellation** (≈100 labelled regions) — but takes 6–10 h per scan and needs a license.
# OASIS ships an equivalent 3-tissue segmentation made with FSL FAST, which we use to show the idea:
# every voxel is classified as **CSF, gray matter or white matter**, and the volumes become biomarkers
# (atrophy → less gray matter, more CSF).

# %%
seg_sl = np.rot90(fseg[:, :, z])
brain_sl = np.rot90(masked[:, :, z])
tissue_cols = {1: SKY, 2: LAV, 3: TEAL}
rgb = np.zeros(seg_sl.shape + (3,), np.uint8)
for k, c in tissue_cols.items():
    rgb[seg_sl == k] = [int(c[i:i + 2], 16) for i in (1, 3, 5)]
Image.fromarray(rgb).save(ASSET_DIR / 'seg_labels.png')
save_asset(to8(brain_sl), 'seg_brain.png')

vols_ml = {name: round(float((fseg == k).sum()) / 1000, 1) for k, name in [(1, 'csf'), (2, 'gm'), (3, 'wm')]}
fig, ax = plt.subplots(1, 2, figsize=(8, 3.6))
ax[0].imshow(brain_sl, cmap='gray'); ax[0].set_title('Skull-stripped T1'); ax[0].axis('off')
ax[1].imshow(rgb); ax[1].set_title('FAST: CSF / GM / WM'); ax[1].axis('off')
savefig('18_segmentation')
print('Tissue volumes (mL, atlas space):', vols_ml)
STATS['seg'] = vols_ml

# %% [markdown]
# ## 19. Techniques 4–5 — Shannon entropy and slice ranking
#
# A CNN trained on 2D slices should see *informative* slices. **Shannon entropy** of a slice's intensity histogram,
# `H = −Σ p(i) · log2 p(i)`, is low for slices that are mostly background or uniform, and high for slices with
# a lot of texture and structure.
#
# **Slice ranking** combines several quality signals per slice into one score and keeps the top-k:
# entropy (information), tissue area (how much brain), and sharpness (variance of the Laplacian, penalises blur).

# %%
def entropy(a, bins=64):
    v = a[a > 0]
    if v.size == 0:
        return 0.0
    p, _ = np.histogram(v, bins=bins, range=(0, 255))
    p = p[p > 0] / p.sum()
    return float(-(p * np.log2(p)).sum())

def to_u8(a):
    return np.clip(a / np.percentile(masked[masked > 0], 99.5) * 255, 0, 255)

# 19.1 Entropy along the whole head (axial slices of the skull-stripped volume)
ent_z = [entropy(to_u8(masked[:, :, k])) for k in range(masked.shape[2])]
area_z = [float((masked[:, :, k] > 0).mean()) for k in range(masked.shape[2])]
fig, ax1 = plt.subplots(figsize=(10, 3.4))
ax1.plot(ent_z, color=TEAL, label='entropy (bits)'); ax1.set_xlabel('axial slice'); ax1.set_ylabel('entropy (bits)')
ax2 = ax1.twinx(); ax2.plot(area_z, color=LAV, label='brain area'); ax2.set_ylabel('brain area fraction')
ax1.set_title('Information per slice across the head')
savefig('19_entropy_along_head')

ex_slices = {'low': int(np.argmax(np.array(area_z) > 0.02)) + 4, 'mid': 95, 'high': int(np.argmax(ent_z))}
hists = {}
for k, zz in ex_slices.items():
    a = to_u8(masked[:, :, zz]); v = a[a > 0]
    h, _ = np.histogram(v, bins=32, range=(0, 255))
    hists[k] = {'z': zz, 'hist': (h / h.sum()).round(4).tolist(), 'entropy': round(entropy(a), 2)}
    save_asset(np.rot90(a).astype(np.uint8), f'entropy_{k}.png')
lo, hi = nonempty(masked, 2)
STATS['entropy'] = {'curve': np.round(ent_z, 3).tolist(), 'area': np.round(area_z, 4).tolist(), 'examples': hists,
                    'sprite_range': [int(lo), int(hi)]}
STATS['entropy']['sprite'] = save_sprite([np.rot90(masked[:, :, k]) for k in range(lo, hi + 1, 2)], 'entropy_sweep.jpg', (176, 208))
STATS['entropy']['sprite']['z'] = list(range(int(lo), int(hi) + 1, 2))

# %%
# 19.2 Slice ranking on a real Kaggle scan (what the CNN would actually be fed)
def sharpness(a):
    return float(ndi.laplace(a).var())

rank_vol = example_vol
rows = []
for _, r in scan_paths(rank_vol).iterrows():
    a = load(r.path)
    rows.append({'slice': int(r.slice), 'entropy': entropy(a), 'area': float((a > 15).mean()), 'sharpness': sharpness(a)})
R = pd.DataFrame(rows).set_index('slice')
Z = (R - R.mean()) / (R.std() + 1e-8)
R['score'] = Z.mean(axis=1)
R['rank'] = R.score.rank(ascending=False).astype(int)
TOP_K = 10
top = R.nsmallest(TOP_K, 'rank')
savetab(R.round(3).sort_values('rank').head(15), '19_slice_ranking')

fig, ax = plt.subplots(figsize=(10, 3.4))
ax.bar(R.index, R.score, color=[TEAL if s in top.index else '#C9D3DC' for s in R.index])
ax.set(xlabel='slice number', ylabel='combined score', title=f'Slice ranking for {rank_vol} (top {TOP_K} in teal)')
savefig('19_slice_ranking')
STATS['ranking'] = {'volume': rank_vol, 'key': CLASS_KEY[vol_label[rank_vol]], 'top_k': TOP_K,
                    'slices': R.reset_index().round(4).to_dict(orient='list')}

# %% [markdown]
# ## 20. Summary and export of presentation assets

# %%
summary = pd.Series({
    'Source': 'OASIS-1 cross-sectional T1 MRI, converted to 2D JPG slices (Kaggle)',
    'Structure': f'{df.label.nunique()} class folders; label = folder name; no metadata file',
    'Total images': f'{len(df):,} ({df.bytes.sum() / 1e9:.2f} GB)',
    'Subjects': f'{df.subject.nunique():,}',
    'Scans (3D volumes)': f'{df.volume.nunique():,}',
    'Classes (images)': '; '.join(f'{c}: {n:,}' for c, n in lab.images.items()),
    'Classes (subjects)': '; '.join(f'{c}: {n:,}' for c, n in lab.subjects.items()),
    'Image format': f"{mc[0]}x{mc[1]} px, mode {STATS['img_mode']}, 8-bit JPG",
    'Slices kept per scan': f"{STATS['slices_per_scan']} (numbers {STATS['slice_min']}–{STATS['slice_max']} of {STATS['raw_sweep']['axis_len']})",
    'Non Demented without clinical rating': f"{STATS['nd_unrated']} of {STATS['nd_total']} subjects",
    'Adjacent-slice correlation (median)': STATS['adj_corr_median'],
    'Test images leaked by a random split': f"{STATS['leak_random_split']:.1%}",
    'Run mode': MODE,
}, name='value').to_frame()
savetab(summary, '20_summary')

# %%
def clean_json(o):
    if isinstance(o, dict):
        return {str(k): clean_json(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean_json(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if np.isnan(o) else round(float(o), 4)
    return o

STATS['generated'] = time.strftime('%Y-%m-%d %H:%M')
(ASSET_DIR / 'stats.js').write_text('window.OASIS = ' + json.dumps(clean_json(STATS), ensure_ascii=False) + ';\n',
                                    encoding='utf-8')
assets = sorted(ASSET_DIR.iterdir())
print(f'{len(assets)} assets in {ASSET_DIR} ({sum(f.stat().st_size for f in assets) / 1e6:.1f} MB)')

if IN_COLAB:
    zip_path = shutil.make_archive('/content/presentation_assets', 'zip', ASSET_DIR)
    shutil.make_archive('/content/eda_outputs', 'zip', OUT)
    if SAVE_TO_DRIVE:
        shutil.copytree(ASSET_DIR, Path(DRIVE_DIR) / 'presentation_assets', dirs_exist_ok=True)
        shutil.copytree(OUT, Path(DRIVE_DIR) / 'outputs', dirs_exist_ok=True)
    from google.colab import files
    files.download(zip_path)            # unzip into <repo>/assets/generated/
    files.download('/content/eda_outputs.zip')

# %% [markdown]
# **Key points**
#
# 1. **Structure:** labels exist only as folder names; subject, session, scan and slice must be decoded from file names.
# 2. **Imbalance:** *Moderate Dementia* has **2 people**. Counting people instead of images makes the imbalance worse.
# 3. **Shortcut risk:** about half of *Non Demented* are young adults who were never clinically rated (CDR missing) —
#    a model can learn *age* instead of *dementia*.
# 4. **Partial 3D:** every scan keeps the same 61 consecutive slices (100–160) of one axis; the rest of the head is missing.
# 5. **Redundancy and leakage:** neighbouring slices are near-copies; a random image split puts the same person in train
#    and test, which inflates accuracy. Always split **by subject**.
# 6. **No preprocessing:** the JPGs come from the *raw* scan (skull, bias field and all) — exactly why the techniques of
#    Sections 16–19 matter.
