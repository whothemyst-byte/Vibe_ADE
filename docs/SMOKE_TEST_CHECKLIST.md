# Smoke Test Checklist

This checklist validates the critical auth/session/cloud sync path before release.

## Preconditions

- App build is green:
  - `npm run build`
- Supabase is configured in `.env`:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- Network is available.

## Test Data

- Account A email (new or existing): `qa+account-a@example.com`
- Account B email (optional conflict test): `qa+account-b@example.com`
- Strong password for both accounts.

## 1. Signup Flow

1. Start app with a clean local auth state.
2. Open auth screen and switch to `Sign Up`.
3. Enter email + password and submit.
4. Expected:
   - Success path: app enters workspace UI.
   - Confirmation-enabled path: message asks to confirm email, then login works after confirmation.
5. Verify no raw backend error string is shown (no `Error invoking remote method...` in UI).

## 2. Login Validation

1. Log out (Settings -> Logout) and return to auth screen.
2. Attempt login with wrong password.
3. Expected:
   - Friendly error: `Invalid email or password.`
4. Attempt repeated submits quickly to trigger limit.
5. Expected:
   - Friendly rate-limit message.
   - Submit button enters cooldown countdown.

## 3. Session Restore (Remember User)

1. Login successfully.
2. Close the app fully.
3. Re-open app.
4. Expected:
   - User remains signed in.
   - Auth screen is skipped.

## 4. Logout Flow

1. Open Settings and click `Logout`.
2. Expected:
   - App returns to auth screen.
   - Reopen app again.
   - User is still logged out.

## 5. Cloud Push (Local -> Remote)

1. Login and open/create workspace.
2. Make a visible change:
   - Rename workspace, or
   - Add terminal/task so `updatedAt` changes.
3. Open Settings -> Cloud Sync -> `Sync Now`.
4. Expected:
   - Success toast.
   - Workspace appears in remote list with recent timestamp.

## 6. Cloud Pull (Remote -> Local)

1. Modify the same workspace from another instance/device (or after clearing local state).
2. In current app, open Settings -> Cloud Sync -> `Pull Remote`.
3. Expected:
   - Local state updates to remote/latest version.
   - App reloads without crash.

## 7. Conflict Strategy (Last-Write-Wins)

1. Create timestamp mismatch for same workspace ID:
   - Make local change at `T1`.
   - Make remote change at `T2` where `T2 > T1` (or inverse).
2. Open Cloud Sync and click `Refresh`.
3. Expected:
   - Conflict summary shows compared items.
   - Per-workspace badge shows winner:
     - `Local` if local `updatedAt` is newer.
     - `Remote` if remote `updatedAt` is newer.
     - `Equal` if same timestamp.
4. Run `Sync Now` and `Pull Remote`:
   - Expected merge result follows winner timestamp without data corruption.

## 8. Error Handling Sanity

1. Disable internet temporarily and attempt login/signup.
2. Expected:
   - Friendly network/timeout message.
   - No crash, UI remains responsive.

## Exit Criteria

- All sections pass with expected behavior.
- No fatal renderer/main process crash.
- No raw internal error strings shown to end users for auth and cloud sync paths.
