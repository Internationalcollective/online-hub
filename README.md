# International Collective online hub

A call sheet hub for every shoot day. Crew and cast open the link, type the passcode, read their call and tap **Confirm**. Production signs in to create, edit, duplicate and delete call sheets.

- **GitHub Pages** hosts the site ('index.html', 'app.js', 'config.js').
- **Supabase** (free plan) stores the call sheets and confirmations. Nothing is readable without the passcode or a production sign-in, so the repo can be public.

## Setup (about 15 minutes, one time)

### 1. Supabase

1. Go to supabase.com, sign up, and click **New project**. Name it 'callsheets' and pick the London region. Save the database password somewhere safe.
2. Open **SQL Editor → New query**. Paste in all of 'supabase/schema.sql'.
3. At the bottom of that file, **change 'CHANGE-THIS-PASSCODE'** to the passcode crew will use. A phrase of three or more words works well, e.g. 'concrete-window-daylight'. Add any other production emails to the admins list. Click **Run**.
4. Start another new query, paste in 'supabase/seed.sql' and click **Run**. This loads the three November shoot days.
5. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key into 'config.js'.

### 2. GitHub

1. On github.com, click **New repository**. Name it 'online-hub' and make it Public (free Pages needs Public unless you're on a paid plan). Create it.
2. Click **uploading an existing file**. Drag in 'index.html', 'app.js', 'config.js' and this README. **Don't upload the 'supabase' folder**: it holds the passcode and the call sheet data, and the repo is public. Click **Commit changes**.
3. Open **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, the branch to **main**, and the folder to **/ (root)**. Click **Save**.
4. After a minute the site is live at 'https://internationalcollective.github.io/online-hub/'.

### 3. Connect sign-in to the site

In Supabase, open **Authentication → URL Configuration**:

- Set **Site URL** to your Pages address, e.g. 'https://internationalcollective.github.io/online-hub/'.
- Add the same address under **Redirect URLs**.

Now open the site and click **Sign in to edit**. Enter your production email and click the link that arrives. You'll see **New**, **Edit**, **Duplicate** and **Delete**.

## Day to day

- **Send crew and cast:** the link plus the passcode, e.g. in the WhatsApp group.
- **Change the passcode:** in the SQL Editor, run
  'update settings set passcode_hash = extensions.crypt('new-passcode', extensions.gen_salt('bf'));'
  Everyone will need the new one.
- **Add another editor:** 'insert into admins (email) values ('name@international-collective.com');'
- **Re-issue:** every save raises the version. Anyone who confirmed an older version sees **Reconfirm**.
- **Pages update on their own.** They refresh every minute and whenever someone returns to the tab.

## Brand assets

- **Wordmark:** save it as 'assets/wordmark.svg'. It appears above the heading automatically.
- **Fonts:** add the licensed web fonts to 'fonts/' with these exact names:
  'avenir-light.woff2', 'avenir-roman.woff2', 'tt-norms-regular.woff2', 'tt-norms-medium.woff2'.
  Until then, Apple devices use their built-in Avenir and other devices use Nunito Sans / Figtree.

## Good to know

- **The passcode is shared,** so anyone who has it can confirm on anyone's behalf. The time of each confirmation is recorded, and only production can undo one.
- **Supabase free projects pause after 7 days with no activity.** Opening the hub counts as activity. If a project does pause, click **Restore** in Supabase.
