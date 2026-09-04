# Campaign ↔ Enrollment

A browser-based dashboard for The Citadel's digital advertising campaign years and cadet admissions workbooks. It is designed for GitHub Pages and does not upload spreadsheet contents to GitHub or any server.

The interface follows The Citadel's approved web palette: Flag Blue `#002856`, Infantry Blue `#7BADD3`, Ring Gold `#EDAE17`, Modern Blue `#3D7CC9`, Big Red `#BA0C2F`, and Bulldog Gray `#D8DFE1`. Open Sans is used throughout the digital interface; American Captain is reserved for the main display headline, with a high-impact system fallback when that licensed font is not installed.

## What the app reads

### Digital advertising workbooks

The dashboard keeps newer and comparison advertising workbooks in separate class-year slots. The UI labels them as `Class of 2029`, `Class of 2030`, and so on. Class of 2030 runs August 15, 2025 through August 14, 2026; adjacent classes shift by one year. Monthly views are ordered August through July.

The importer reads monthly `Impressions`, `Clicks`, `Spend`, and `Budget`, then derives CTR, CPC, and CPM. Current-year source tabs include:

- Social
- Google Display
- Google Search
- YouTube, when present
- Targeted

The current workbook's `Total` tab identifies that format, while totals are recalculated from channel tabs. For the 2025–26 workbook, the `Overall` tab supplies the all-channel comparison so separate programmatic and retargeting tabs are not double-counted. Core channel comparisons remain available for Social, Google Display, Google Search, and YouTube.

The dashboard includes selectable monthly and cumulative YoY views for Spend, Impressions, Clicks, CTR, CPC, CPM, and Budget. Targeted campaigns are broken out individually in Source Allocation.

Campaign rules include:

- Reddit → SCCC Regional
- SCCC Competitor Conquest → SCCC National
- SCCC Instate → SCCC South Carolina
- AMSCUS, Accepted, Deposited, Quizlet, and MNTN → SCCC
- CGC programs remain separate, including Project Management (`PM`)
- Degree Completion Engineering remains distinct from CGC Engineering
- One-off competitor conquest labels remain visible under CGC, Degree Completion, or Veterans

### Application and deposit workbooks

Upload one standardized workbook per class. Name each file `Class of YYYY.xlsx`, such as `Class of 2029.xlsx` or `Class of 2030.xlsx`. The workbook must contain:

- `Accept Date`, used for the Application monthly series
- `Deposit Date`, used for the Deposit monthly series
- `State`, used for the U.S. heatmap

Uploading a class again replaces only that class while keeping other uploaded classes available for comparison. The map appears only for SCCC and offers Applications or Deposits. South Carolina is treated as in-state. Blank `State` cells are counted and displayed as `International Students` beside the U.S. map. Named values that are not recognized U.S. state abbreviations remain in overall totals but outside the map.

The state map never uses preview data. Until a matching `Class of YYYY` workbook is uploaded, it shows an upload prompt instead of the former NC/GA/FL sample. Once loaded, the summary reports how many U.S. states were populated from the workbook.

## Update the dashboard during the year

1. Open the dashboard URL.
2. Choose **Update data**.
3. Upload the newer-class advertising workbook.
4. Upload the comparison-class advertising workbook.
5. Upload each `Class of YYYY` application and deposit workbook, one at a time.

The newest file replaces the previous browser copy. Parsed data is saved in IndexedDB on that device, so it remains after refreshes. Each browser or computer keeps its own copy. The original workbooks and their contents are never added to the website repository.

## Run locally

Requirements: Node.js 22 and pnpm 11.

```bash
pnpm install
pnpm dev
```

For a production check:

```bash
pnpm build
pnpm preview
```

## Publish with GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`, which builds and publishes the site automatically.

1. Create an empty GitHub repository, for example `campaign-enrollment-dashboard`.
2. Push this project to the repository's `main` branch.
3. In the GitHub repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **GitHub Actions** as the source.
5. Open the **Actions** tab and wait for **Deploy dashboard to GitHub Pages** to complete.
6. The site will be available at `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

One command-line publishing path is:

```bash
git init
git add .
git commit -m "Add campaign enrollment dashboard"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Future code changes pushed to `main` redeploy automatically. Spreadsheet updates do not require a code push; upload them inside the live dashboard.

## Privacy note

GitHub Pages is a website host, not an authentication layer. Treat the published dashboard URL as public unless your organization has separately configured access controls. Workbook data stays in the local browser, but anyone with the site can use the app with their own files.
