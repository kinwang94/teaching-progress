# 給 Claude／AI agent 的部署 prompt

**完全沒用過 GitHub、不會寫程式也沒關係。** 這份文件是設計給第一次接觸的人看的——
你不需要看懂任何程式碼，只要有一個 Claude（或其他能操作電腦/終端機的 AI 助手）跟著做就好。
下面會解釋每個陌生名詞是什麼，也會附上可以直接點的連結。

## 這是什麼、會發生什麼事

這套工具分兩塊：
- **程式（模板）**：放在一個公開網頁（GitHub Pages），誰都能看，但裡面不含任何你的資料
- **你的資料**（課表、班別、之後每天記的實際進度）：存在你自己帳號底下兩個「私有」的小筆記本
  （GitHub 叫它 Gist），只有你自己（和你自己的網頁）看得到

設定完成後，你會得到一個網址，手機/電腦都能打開、可以加到主畫面變成一個 app 圖示。

---

## 開始前你需要準備

1. **一個 GitHub 帳號**（完全免費）。還沒有的話先去註冊：
   https://github.com/signup
2. **你任教班別的課表來源**：Excel、PDF、課表照片、學校排課系統匯出的檔案，什麼格式都可以，
   直接給 Claude 判讀，不用自己先整理
3. 如果有的話：學校校曆（假期、考試週）、影印單價、各班人數（這兩項選填）

有 GitHub 帳號、有課表檔案，就可以開始了。

---

## 給 Claude 的 prompt（從這裡開始複製整段）

```
你要幫我設定一套「教學進度追蹤」工具（teaching-progress，一個純前端的 PWA），
架構是：程式碼放公開 GitHub repo + GitHub Pages，我的課表和學校/姓名等個人資料
存在我自己的私有 GitHub Gist，兩者分開，這樣公開的程式碼 repo 完全不含我的個資。

我是第一次用 GitHub，請假設我什麼都不懂，每一步都講清楚在做什麼、為什麼要這樣做。
如果你能操作終端機（有 git、gh 這些工具或可以幫我安裝），直接動手做最快；
如果你不能執行指令（例如只是純聊天），改成一步一步教我在網頁上點什麼，
每一步都給我可以直接點的連結，不要假設我知道要去哪裡找。

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
   - 幫我在 GitHub 建一個新的 **public** repo（我會告訴你名稱，或你可以問我；
     不知道怎麼取名的話，`teaching-progress` 這種簡單英文名稱就可以）
   - 你可以用指令建立，或者引導我到 https://github.com/new 自己手動建立
   - 把這個模板資料夾裡的檔案推上去（**不要**推 plan.json、也不要把我的學校/姓名
     寫進任何程式碼或 README 裡）
   - 開啟 GitHub Pages：進到這個 repo 的 Settings → Pages（網址規則是
     `https://github.com/<我的帳號>/<repo名稱>/settings/pages`）→ Source 選
     Deploy from a branch → Branch 選 main / (root) → Save
   - 用 `gh` CLI 或引導我手動操作都可以；如果本機沒裝 git/gh，先幫我裝，
     裝的時候也講清楚為什麼要裝這個

5. **建立私有 Gist 存放課表**：
   - Gist 是 GitHub 的「小筆記本」功能，選「secret」（私有）建立的話，
     沒有連結、沒有你自己登入就看不到內容
   - 你可以用 `gh gist create` 指令建立，或者引導我到 https://gist.github.com
     自己手動貼上內容（記得選 **Create secret gist**，不是 public gist）
   - 記下這個 Gist 網址列裡最後一串英數字（那就是 Gist ID），等一下要填進網頁設定

6. **開啟同步**：
   - GitHub 的「Token」是一把只給這個網頁用的鑰匙，不是你的登入密碼。引導我到
     https://github.com/settings/tokens/new?scopes=gist&description=teaching-progress
     這個連結會直接開在「新增 Token」頁面、而且已經幫你勾好 `gist` 這個權限——
     我只要確認有效期（選 No expiration 最簡單）然後按最下面 Generate token，
     複製出現的那一長串文字（只會顯示一次，記得先複製起來）
   - 打開剛部署好的網址，按右上角「設定」，把 token 貼上、「課程設定 Gist ID」
     貼上第 5 步的那組 ID，「進度記錄 Gist ID」留空（app 會自動幫我建一個新的
     私有 Gist 存放我之後的實際記錄）
   - 存檔後確認頁面正確顯示我的班別和課表

7. **驗證**：實際點開「今日」「月曆」「測驗・功課」「代印」「總覽對照」幾個分頁，
   確認資料顯示正確，記錄一節課看看有沒有正常運作，重新整理頁面確認記錄有留住。

8. **多裝置設定（如果我還會用手機/另一台電腦開）**：
   - 第 6 步存檔後，「進度記錄 Gist ID」欄位會自動填上剛建立的 ID——提醒我把這組 ID
     記下來（截圖或抄下來都行），或告訴我之後也能到 https://gist.github.com/mine
     這個網址找檔名 `progress.json` 的那個
   - 在第二台裝置打開同一個網址 → 設定 → 貼同一組 token、**兩個** Gist ID 都填上
     （課程設定 Gist ID 和進度記錄 Gist ID 都要填，不是只填一個）→ 存檔
   - 手機的話可以提醒我用 Safari「加入主畫面」或 Chrome「安裝應用程式」，變成圖示、
     離線也打得開

9. **之後怎麼更新課表**：跟我說清楚——之後學期中課表有變動，只要把新的來源檔案
   再給 Claude，重新產生 plan.json 內容、更新同一個私有 Gist 就好（用
   `gh gist edit <gist-id> plan.json` 或直接透過 API PATCH），我平常記錄的
   實際進度存在另一個 Gist，不會被動到。

整個過程有不確定的地方（班別結構、合併方式、日期範圍等）要問我，不要自己猜測亂填，
這份資料之後我會每天用，錯了會很麻煩。
```

---

## 如果你想自己一步一步點、不透過 agent

以下每一步都可以直接點連結完成，不需要打任何指令。

1. **複製這個模板**：打開這個 repo 頁面右上角「Fork」，變成你自己名下的一份副本
   （或者到 https://github.com/new 建一個新的 public repo，把這個資料夾裡的檔案
   用網頁「Upload files」拖進去）
2. **開啟 GitHub Pages**：進你 fork 出來那個 repo 的 Settings → Pages
   （網址是 `https://github.com/<你的帳號>/<repo名稱>/settings/pages`）→
   Source 選 `Deploy from a branch` → Branch 選 `main` / `(root)` → Save。
   等一兩分鐘，網址 `https://<你的帳號>.github.io/<repo名稱>/` 就能打開了（先不會有資料）
3. **準備你的課表資料**：照 [PLAN_SCHEMA.md](./PLAN_SCHEMA.md) 的格式手打一份 `plan.json`，
   或者直接把你的課表檔案丟給 Claude 幫你產生（推薦這個做法，格式比較不會出錯）
4. **建立 Token**（給網頁用的專屬鑰匙）：點
   https://github.com/settings/tokens/new?scopes=gist&description=teaching-progress
   （已經幫你勾好 `gist` 權限）→ 有效期選 No expiration → 最下面按 Generate token
   → 複製那一長串文字（只會顯示這一次）
5. **建立私有 Gist 存放課表**：點 https://gist.github.com 新增一個檔案，
   檔名打 `plan.json`，內容貼第 3 步的資料 → 下面選 **Create secret gist**
   （千萬不要選 public gist）→ 建立後，網址列最後一串英數字就是 Gist ID，記下來
6. **回到你的網站設定**：打開第 2 步的網址 → 右上角「設定」→ 貼第 4 步的 token、
   貼第 5 步的課程設定 Gist ID，「進度記錄 Gist ID」留空 → 存檔
   （app 會自動幫你建一個新的私有 Gist 存實際記錄；換裝置的話兩個 Gist ID 都要貼，
   進度記錄那組可以到 https://gist.github.com/mine 找檔名 `progress.json` 的那個）
