# 給 Claude／AI agent 的部署 prompt

把下面整段複製貼給 Claude Code（或其他能操作終端機、有檔案讀寫和 `gh`/`git` 能力的 agent），
它會帶著你一步步把這套「教學進度追蹤」設定成你自己的版本、部署好、資料私有分開存放。

你自己不需要先讀懂這份文件——把它連同下面「使用者要準備的東西」交給 agent 就好。

---

## 使用者要準備的東西（開始前）

- 你任教班別的課節表來源：Excel／PDF 課表、集體備課表、學校排課系統匯出、或課表照片，什麼格式都可以，交給 agent 判讀
- 學校的校曆（假期、考試週、活動日期），如果有的話
- 一個 GitHub 帳號（免費版即可）
- 影印單價（如果學校有代印收費，選填）
- 各班人數（選填，方便「代印」分頁自動算份數）

---

## 給 Claude 的 prompt（從這裡開始複製）

```
你要幫我設定一套「教學進度追蹤」工具（teaching-progress，一個純前端的 PWA），
架構是：程式碼放公開 GitHub repo + GitHub Pages，我的課表和學校/姓名等個人資料
存在我自己的私有 GitHub Gist，兩者分開，這樣公開的程式碼 repo 完全不含我的個資。

請照這個順序做：

1. **了解現有模板**：這個 repo 本身可以直接當模板 fork／複製使用（不用重寫程式碼），
   讀一下 repo 裡的 README.md 和 PLAN_SCHEMA.md，了解架構和 plan.json 的完整格式。

2. **收集我的課表資料**：跟我要課節表來源檔案（Excel/PDF/照片/課表匯出都可以），
   問清楚：
   - 我有哪些班別、各班上什麼科目
   - 學期怎麼分、學期起訖日期、有哪些假期和特殊活動日
   - 每個班每週固定上哪幾節課（星期幾、第幾節）
   - 如果同一班有拆科目上課（例如同班兩科），我希望「代印」等不分科目功能怎麼合併
   - 影印單價、各班人數（沒有就跳過，這兩項選填）
   把這些資料整理、逐週逐節推算出完整課表。

3. **產生 plan.json**：照 PLAN_SCHEMA.md 的格式，把我的學校/教師/班別/課節表
   整理成一份 plan.json。過程中如果同一班有多節連續內容、測驗日、假期調整等，
   跟我確認清楚再定案，不要自己臆測太多。

4. **部署程式碼（不含個資）**：
   - 幫我在 GitHub 建一個新的 **public** repo（我會告訴你名稱，或你可以問我）
   - 把這個模板資料夾裡的檔案推上去（**不要**推 plan.json、也不要把我的學校/姓名
     寫進任何程式碼或 README 裡）
   - 開啟 GitHub Pages（Settings → Pages → Deploy from a branch → main / root）
   - 用 `gh` CLI 或引導我手動操作都可以；如果本機沒裝 git/gh，先幫我裝

5. **建立私有 Gist 存放課表**：
   - 用 `gh gist create` 把第 3 步產生的 plan.json 建立成一個 **secret**（私有）Gist
   - 記下這個 Gist 的 ID，等一下要填進網頁設定

6. **開啟同步**：
   - 引導我去 GitHub → Settings → Developer settings → Personal access tokens
     → Tokens (classic) → 只勾 `gist` 權限 → 建立一個 token
   - 打開剛部署好的網址，按「設定」，把 token 貼上、「課程設定 Gist ID」貼上第 5 步的 ID，
     「進度記錄 Gist ID」留空（app 會自動幫我建一個新的私有 Gist 存放我之後的實際記錄）
   - 存檔後確認頁面正確顯示我的班別和課表

7. **驗證**：實際點開「今日」「月曆」「測驗・功課」「代印」「總覽對照」幾個分頁，
   確認資料顯示正確、記錄一節課看看有沒有正常運作。

8. **之後怎麼更新課表**：跟我說清楚——之後學期中課表有變動，只要把新的來源檔案
   再給 Claude，重新產生 plan.json 內容、更新同一個私有 Gist 就好（用
   `gh gist edit <gist-id> plan.json` 或直接透過 API PATCH），我平常記錄的
   實際進度存在另一個 Gist，不會被動到。

整個過程有不確定的地方（班別結構、合併方式、日期範圍等）要問我，不要自己猜測亂填，
這份資料之後我會每天用，錯了會很麻煩。
```

---

## 如果你想自己手動做（不透過 agent）

1. Fork 或複製這個 repo 到你自己帳號下，設成 public
2. 開啟 GitHub Pages（Settings → Pages → Deploy from a branch → `main` / `(root)`）
3. 照 [PLAN_SCHEMA.md](./PLAN_SCHEMA.md) 手打或請 Claude 幫你產生一份 `plan.json`
4. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   → 只勾 `gist` → 建立
5. 用這個 token 建一個 **secret gist**，檔名 `plan.json`，內容貼你第 3 步的資料
   （可以在 gist.github.com 網頁上直接建立，不需要指令）
6. 打開你部署好的網址 → 「設定」→ 貼 token、貼課程設定 Gist ID → 存檔
