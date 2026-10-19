# GenoBit · Neuroimaging relaunch

Presentation and exploratory notebook for relaunching GenoBit's **Neuroimaging** research project on the
[OASIS-1](https://sites.wustl.edu/oasisbrains/) MRI database.

| File | What it is |
|---|---|
| `index.html` | The presentation (open it in a browser; → / clic to advance, `f` for fullscreen) |
| `OASIS_EDA.ipynb` | Exploratory analysis of the database + generator of every image and number in the slides |
| `assets/generated/` | Output of the notebook used by the slides (sprites, technique demos, `stats.js`) |
| `data/kaggle_file_listing.csv.gz` | List of the 86,437 files of the Kaggle dataset (lets the notebook run without downloading everything) |
| `PlayBook/` | GenoBit brand palette and logo |
| `tools/` | `nb_source.py` is the editable source of the notebook; `build_notebook.py` rebuilds the `.ipynb` |

## Presentation

Open `index.html` directly, or serve the folder (`python -m http.server`).

### Deploy on Vercel

The site is static (no build step). `vercel.json` sets it up and `.vercelignore` keeps the notebook, data listing,
tools and source material out of the deployment, so only `index.html` and `assets/` are published (~5 MB).

1. In Vercel: **Add New → Project → Import** `Mmateo101/presentation-neuroimaging`.
2. Framework preset: **Other**. Leave build command and output directory empty (they come from `vercel.json`).
3. Deploy. Every push to `main` redeploys automatically.

Or from a terminal with the Vercel CLI: `npx vercel` (preview) and `npx vercel --prod`.
Navigation: click or →/Space to advance, ← to go back, `f` fullscreen, `#N` in the URL jumps to slide N.

## Notebook

**Google Colab (recommended):** open `OASIS_EDA.ipynb` in Colab and *Run all*. It runs in `full` mode
(downloads the whole 1.36 GB Kaggle dataset; ~10 min). At the end it downloads `presentation_assets.zip`;
unzip it into `assets/generated/` to update the slides.

**Locally:** run it from the repository root. With less than 8 GB of free disk it switches to `lite` mode:
metadata analyses use the complete file list, pixel analyses use a stratified sample (~800 images), and the
assets are written straight into `assets/generated/`.

```bash
pip install kagglehub nibabel SimpleITK scikit-image openpyxl requests pandas matplotlib nbconvert
python -m jupyter nbconvert --to notebook --execute OASIS_EDA.ipynb --output-dir .work
```

Data sources: Kaggle `ninadaithal/imagesoasis` (2D JPG slices), OASIS-1 disc 1 (only the first subject is streamed,
~115 MB) and the OASIS-1 clinical spreadsheet.
