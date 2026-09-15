# admin-cert

## Schema

```mermaid
graph LR
    subgraph Frontend ["Frontend (static host)"]
        IDX["index.html<br/>+ dashboard.js"]
        ADM["admin.html<br/>+ admin.js"]
        VER["verify/index.html<br/>+ verify.js"]
        AUTH["auth.js<br/>(PIN, token, api())"]
        NAV["nav.js<br/>(shared top nav)"]
        CFG["config.js"]
        LS[("localStorage<br/>cert_&lt;id&gt; · lv_certlist_v1<br/>5 min TTL")]
    end

    subgraph Backend ["Apps Script Web App"]
        CODE["Code.gs<br/>(router + auth + getCert)"]
        SHG["Sheets.gs<br/>(read/append/delete)"]
        CLG["Cloudinary.gs<br/>(sign + destroy)"]
        EMG["Email.gs<br/>(registerCert + mailer)"]
        SC[("ScriptCache<br/>cert_&lt;id&gt; · list_certs_v1<br/>tok_&lt;uuid&gt;")]
        WARM["keepWarm()<br/>5-min trigger"]
    end

    SHEET[("Google Sheet<br/>Certificates tab")]
    CLD["Cloudinary<br/>raw/upload · raw/destroy"]
    GM["Gmail<br/>MailApp.sendEmail"]

    IDX --> AUTH
    ADM --> AUTH
    IDX --> NAV
    ADM --> NAV
    IDX --> CFG
    ADM --> CFG

    IDX <-.->|read/write| LS
    VER <-.->|read/write| LS

    AUTH -->|POST text/plain<br/>verifyPin · listCerts · deleteCert| CODE
    ADM -->|POST text/plain<br/>signUpload · registerCert| CODE
    ADM -->|multipart POST<br/>signed raw upload| CLD
    VER -->|GET ?action=getCert| CODE

    CODE --> CLG
    CODE --> SHG
    CODE --> EMG
    CODE <-.->|read/write + bust on writes| SC

    SHG --> SHEET
    CLG -->|raw/upload signature| ADM
    CLG -->|raw/destroy + signed POST| CLD
    EMG -.->|on notify=true| GM
    CLD -->|secure_url · public_id · result| ADM
    CLD -->|result: ok / not found| CODE
    WARM -.->|keeps runtime alive| CODE
```

## Sheet schema — `Certificates` tab

| # | Column | Example | Notes |
|---|---|---|---|
| 1 | `CertID` | `encom-26abk-b1` | Unique, lowercase, `[a-z0-9-]` |
| 2 | `StudentName` | `Achraf Ben Khadla` | |
| 3 | `Course` | `English Communication` | |
| 4 | `Level` | `B1` | |
| 5 | `IssueDate` | `2026-06-15` | ISO date |
| 6 | `Issuer` | `Lingo-Ville Language Centre` | |
| 7 | `Email` | `student@example.com` | Optional |
| 8 | `CertURL` | `https://res.cloudinary.com/...` | Cloudinary secure URL |
| 9 | `CertPublicID` | `lingoville/certs/encom-...` | For `raw/destroy` |
| 10 | `ReportURL` | `https://res.cloudinary.com/...` | Optional |
| 11 | `ReportPublicID` | `lingoville/reports/encom-...-report` | Optional |
| 12 | `Status` | `active` · `revoked` · `pending` | Drives public page state |
| 13 | `CreatedAt` | `2026-06-15T10:32:11.000Z` | ISO timestamp |
| 14 | `UpdatedAt` | `2026-06-15T10:32:11.000Z` | ISO timestamp |
| 15 | `CreatedBy` | `admin` | |

## Upload

```mermaid
sequenceDiagram
    autonumber
    participant U  as Admin
    participant FE as admin.js
    participant LS as localStorage
    participant AU as auth.js
    participant GS as Apps Script
    participant SC as ScriptCache
    participant CL as Cloudinary
    participant SH as Sheet
    participant GM as Gmail

    U  ->> FE: Open admin.html
    FE ->> AU: requireAuth()
    alt No token in localStorage
        U  ->> FE: Enter PIN
        FE ->> AU: verifyPin(pin)
        AU ->> GS: POST verifyPin
        GS ->> SC: put tok_<uuid> (6 h)
        GS -->> AU: token
        AU ->> LS: store lv_admin_token
    end
    AU -->> FE: onReady(token)

    U  ->> FE: Fill form + attach PDF(s)
    FE ->> GS: POST signUpload (token, folder)
    GS ->> SC: verify tok_<uuid>
    SC -->> GS: ok
    GS -->> FE: signature, timestamp, apiKey, cloudName

    FE ->> CL: POST /raw/upload<br/>file + signature + folder
    CL -->> FE: secure_url, public_id

    opt Report PDF attached
        FE ->> GS: POST signUpload (token, reports folder)
        GS -->> FE: signature
        FE ->> CL: POST /raw/upload
        CL -->> FE: secure_url, public_id
    end

    FE ->> GS: POST registerCert (token, data)
    GS ->> SC: verify tok_<uuid>
    GS ->> SH: findRowByCertId (duplicate guard)
    SH -->> GS: not found
    GS ->> SH: appendRow
    GS ->> SC: remove list_certs_v1
    GS -->> FE: success { record }

    alt Email provided AND notify checked
        GS ->> GM: sendEmail(cert URL)
    end

    FE ->> LS: remove lv_certlist_v1
    FE -->> U: Success screen with live URL
```

## Dashboard — load

```mermaid
sequenceDiagram
    autonumber
    participant U  as Admin
    participant FE as dashboard.js
    participant LS as localStorage
    participant AU as auth.js
    participant GS as Apps Script
    participant SC as ScriptCache
    participant SH as Sheet

    U  ->> FE: Open index.html
    FE ->> AU: requireAuth()
    AU -->> FE: onReady(token)

    FE ->> LS: read lv_certlist_v1
    alt Cache hit (< 5 min)
        LS -->> FE: cached certs[]
        FE -->> U: Table rendered instantly
        FE ->> GS: POST listCerts (background refresh)
    else Cache miss
        FE -->> U: "Loading…" placeholder
        FE ->> GS: POST listCerts (token)
    end

    GS ->> SC: get list_certs_v1
    alt Server cache hit (< 30 s)
        SC -->> GS: cached { certs[] }
    else Server cache miss
        GS ->> SH: getDataRange().getValues()
        SH -->> GS: rows
        GS ->> SC: put list_certs_v1 (30 s)
    end
    GS -->> FE: { certs[] }
    FE ->> LS: write lv_certlist_v1 (5 min)
    FE -->> U: Table re-rendered
```

## Dashboard — delete (optimistic)

```mermaid
sequenceDiagram
    autonumber
    participant U  as Admin
    participant FE as dashboard.js
    participant LS as localStorage
    participant GS as Apps Script
    participant SC as ScriptCache
    participant CL as Cloudinary
    participant SH as Sheet

    U  ->> FE: Click Delete on a row
    FE ->> U: Confirm dialog<br/>(warns: removes row + files)
    U  -->> FE: Confirm

    FE ->> FE: splice row from allCerts[]
    FE ->> LS: remove lv_certlist_v1
    FE -->> U: Row disappears immediately

    FE ->> GS: POST deleteCert (token, certId)
    GS ->> SC: verify tok_<uuid>
    SC -->> GS: ok
    GS ->> SH: find row by CertID
    SH -->> GS: row, CertPublicID, ReportPublicID

    alt CertPublicID present
        GS ->> CL: POST /raw/destroy<br/>(signed public_id)
        CL -->> GS: { result: "ok" | "not found" }
    end

    opt ReportPublicID present
        GS ->> CL: POST /raw/destroy
        CL -->> GS: { result }
    end

    GS ->> SH: deleteRow
    GS ->> SC: remove cert_<id>
    GS ->> SC: remove list_certs_v1
    GS -->> FE: { certId, certFile, reportFile, warning? }

    alt warning present
        FE -->> U: window.alert(warning)
    end

    FE ->> GS: POST listCerts (silent refresh)
    GS -->> FE: fresh { certs[] }
    FE ->> LS: write lv_certlist_v1
    FE -->> U: Table matches server

    Note over FE,U: On API error → row is restored, alert shown
```

## Public verification

```mermaid
sequenceDiagram
    autonumber
    participant U  as Visitor
    participant FE as verify.js
    participant LS as localStorage
    participant GS as Apps Script
    participant SC as ScriptCache
    participant SH as Sheet
    participant CL as Cloudinary

    U  ->> FE: Open cert.lingo-ville.com/#/encom-...
    FE ->> LS: read cert_encom-...

    alt Local cache hit (< 5 min)
        LS -->> FE: cert
        FE -->> U: Rendered instantly (no network)
    else Local cache miss
        FE -->> U: Loading animation
        FE ->> GS: GET ?action=getCert&id=encom-...
        GS ->> SC: get cert_encom-...
        alt Server cache hit (< 5 min)
            SC -->> GS: cached cert
        else Server cache miss
            GS ->> SH: getDataRange().getValues()
            SH -->> GS: rows
            GS ->> SC: put cert_encom-... (5 min)
        end
        GS -->> FE: { cert }
        FE ->> LS: write cert_encom-... (5 min)
    end

    alt Status = active
        FE ->> CL: GET CertURL (PDF)
        CL -->> FE: PDF bytes
        FE -->> U: PDF rendered (page 1 on mobile, all on desktop)
    else Status = revoked
        FE -->> U: "Revoked" banner, PDF hidden
    end

    Note over FE,U: Prefetch on typing:<br/>valid-looking IDs fire a<br/>silent getCert + cache write
```

## Cache rules at a glance

| Cache | Key | TTL | Written by | Invalidated by |
|---|---|---|---|---|
| `localStorage` | `lv_certlist_v1` | 5 min | `dashboard.js` after `listCerts` | Manual delete (optimistic), successful upload, natural expiry |
| `localStorage` | `cert_<id>` | 5 min | `verify.js` after `getCert` | Natural expiry |
| `localStorage` | `lv_admin_token` | 6 h | `auth.js` after `verifyPin` | Logout, `TOKEN_EXPIRED` |
| `ScriptCache` | `list_certs_v1` | 30 s | `Code.gs` after `listCerts` reads Sheet | `registerCert`, `deleteCert`, natural expiry |
| `ScriptCache` | `cert_<id>` | 5 min (hit) / 60 s (miss) | `Code.gs` after `getCert` reads Sheet | `deleteCert` for that ID, natural expiry |
| `ScriptCache` | `tok_<uuid>` | 6 h | `Code.gs` after `verifyPin` | Natural expiry |