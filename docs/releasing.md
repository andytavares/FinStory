# Releasing Money

Money ships as a signed, notarized Apple Silicon app. Each release is a GitHub Release on
[andytavares/FinStory](https://github.com/andytavares/FinStory/releases). Installed copies
find new releases there and update themselves.

You do the one-time setup (parts 1–4) once. After that, a release is part 5 only.

## What you need before you start

- A Mac with macOS 14 or later and Xcode installed from the App Store.
- An Apple Developer Program membership (the paid $99/year one) under your Apple ID.
- Admin access to the GitHub repository `andytavares/FinStory`.
- This repository cloned on your Mac.

## Part 1. Create the Developer ID Application certificate

Apple uses this certificate to identify you as the app's publisher. Only the **Developer ID
Application** type works for apps you distribute outside the Mac App Store.

1. Open **Xcode**.
2. Choose **Xcode › Settings…** (or **Preferences…** on older versions), then click **Accounts**.
3. If your Apple ID is not listed, click **+** at the bottom left, choose **Apple ID**, and sign in.
4. Select your Apple ID, then select your team in the list on the right. The role must be
   **Account Holder** or **Admin**. Only those roles can create Developer ID certificates.
5. Click **Manage Certificates…**.
6. Click **+** at the bottom left and choose **Developer ID Application**.
7. Wait until a certificate named **Developer ID Application: <Your Name> (<TEAMID>)** appears.
   Click **Done**.
8. Open **Keychain Access** (press ⌘Space, type `Keychain Access`, press Return).
9. In the sidebar, select **login**, then the **My Certificates** tab.
10. Find **Developer ID Application: <Your Name> (<TEAMID>)**. Click the ▸ arrow next to it.
    A private key must appear under it. If there is no private key, the certificate cannot sign.
    Go back to step 5, delete that certificate, and create it again on this Mac.
11. Write down the 10-character code in the parentheses. This is your **Team ID**.
    You can also find it at <https://developer.apple.com/account> under **Membership details**.

## Part 2. Export the certificate for GitHub Actions

GitHub's build machine needs a copy of the certificate and its private key.

1. In **Keychain Access › login › My Certificates**, right-click
   **Developer ID Application: <Your Name> (<TEAMID>)** (the certificate, not the key).
2. Choose **Export "Developer ID Application: …"…**.
3. Set **File Format** to **Personal Information Exchange (.p12)**.
4. Save it as `developer-id.p12` on your Desktop.
5. Enter a strong password when asked, and save the password in your password manager.
   This password is `CSC_KEY_PASSWORD` in Part 4.
6. Enter your Mac login password if Keychain Access asks for it, then click **Always Allow**.
7. Open **Terminal** and convert the file to one line of text:

   ```sh
   base64 -i ~/Desktop/developer-id.p12 | pbcopy
   ```

   The text is now on your clipboard. It is `CSC_LINK` in Part 4. Paste it into GitHub in
   Part 4 before you copy anything else.

## Part 3. Create an app-specific password for notarization

Apple checks every release for malware (notarization). The build signs in to Apple with your
Apple ID and an app-specific password.

1. Go to <https://account.apple.com> and sign in with the Apple ID of your developer account.
2. Open **Sign-In and Security**, then **App-Specific Passwords**.
3. Click **+** (or **Generate an app-specific password**).
4. Name it `FinStory GitHub Actions` and click **Create**.
5. Copy the password (format `abcd-efgh-ijkl-mnop`) and save it in your password manager.
   This is `APPLE_APP_SPECIFIC_PASSWORD` in Part 4. Apple shows it only once.

## Part 4. Add the secrets to GitHub

1. Go to <https://github.com/andytavares/FinStory/settings/secrets/actions>.
2. For each row below, click **New repository secret**, enter the **Name** exactly as written,
   paste the **Secret**, and click **Add secret**.

   | Name | Secret |
   |---|---|
   | `CSC_LINK` | The base64 text from Part 2, step 7 |
   | `CSC_KEY_PASSWORD` | The `.p12` password from Part 2, step 5 |
   | `APPLE_ID` | The email address of your Apple developer account |
   | `APPLE_APP_SPECIFIC_PASSWORD` | The password from Part 3, step 5 |
   | `APPLE_TEAM_ID` | The Team ID from Part 1, step 11 |

3. Do not add `GH_TOKEN`. The workflow uses the token GitHub gives every run.
4. Go to <https://github.com/andytavares/FinStory/settings/actions>. Under
   **Workflow permissions**, select **Read and write permissions** and click **Save**.
   The release job needs this to create the GitHub Release.
5. Delete `~/Desktop/developer-id.p12`. Your certificate stays in Keychain Access, and
   GitHub has its own copy.

   ```sh
   rm ~/Desktop/developer-id.p12
   ```

## Part 5. Publish a release

1. Make sure `main` is green on GitHub (the **CI** workflow passed).
2. In Terminal, at the repository root, on an up-to-date `main`:

   ```sh
   git switch main
   git pull
   npm version patch   # or: minor, major. Updates package.json and creates tag v1.2.3
   git push --follow-tags
   ```

3. Open <https://github.com/andytavares/FinStory/actions>. The **Release** workflow starts
   for the new tag. It takes about 10–20 minutes, most of it waiting for Apple's notarization.
4. When it passes, open <https://github.com/andytavares/FinStory/releases>. The release is a
   **draft** with three files: `Money-<version>-arm64.dmg`, `Money-<version>-arm64-mac.zip`,
   and `latest-mac.yml`.
5. Click **Edit** on the draft, write the release notes, and click **Publish release**.
   Installed copies of Money see the update within 6 hours, or at their next launch.

## Part 6. Check the first release

Do this once, on the first release, to confirm signing and notarization worked.

1. Download the `.dmg` from the release page, open it, and drag **Money** to **Applications**.
2. Open **Money** from **Applications**. macOS must open it without a warning about an
   unidentified developer.
3. In Terminal, confirm the signature and the notarization ticket:

   ```sh
   codesign --verify --deep --strict --verbose=2 /Applications/Money.app
   spctl --assess --type execute --verbose /Applications/Money.app
   ```

   The second command must print `accepted` and `source=Notarized Developer ID`.
4. To test auto-update: publish the next patch version (Part 5), keep Money open, and wait
   for the **"Money <version> is ready"** message, or quit and reopen Money. Click
   **Restart now**. Then choose **Money › About Money** and confirm the new version.

## When something fails

| Symptom | Cause and fix |
|---|---|
| Release job fails at `codesign` with "no identity found" | `CSC_LINK` or `CSC_KEY_PASSWORD` is wrong, or the `.p12` has no private key. Repeat Part 1 step 10 and Part 2. |
| Release job fails at notarization with "invalid credentials" | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` or `APPLE_TEAM_ID` is wrong. Create a new app-specific password (Part 3) and update the secret. |
| Release job fails with "Resource not accessible by integration" | Workflow permissions are read-only. Repeat Part 4 step 4. |
| macOS says the app "is damaged" or "cannot be opened" | The build was not notarized. Check the notarization step in the job log. |
| Installed app never offers the update | The release is still a draft. Publish it (Part 5 step 5). |
| Certificate expires (after 5 years) | Repeat Parts 1, 2 and 4. Existing installs keep working. |
