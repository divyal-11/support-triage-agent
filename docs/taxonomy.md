# Spotify Customer Support — Intent Taxonomy

> **Version:** 1.0  
> **Source:** Empirically derived from 13,922 `@SpotifyCares` Twitter customer interactions (`data/spotifycares-pairs.json`).  
> **Total Intents:** 8 mutually exclusive categories.

---

## 1. Design Principles

This taxonomy was built following three strict constraints:
1. **Grounded in Real Data:** Every intent corresponds to real recurring problem clusters discovered by reading through customer tweets in `data/spotifycares-pairs.json`, not preconceived guesses.
2. **Action-Oriented for Support Agents:** Each intent maps directly to an operational resolution path:
   - **Technical/Informational (Auto-Handle):** Standard troubleshooting, clear cache, re-install, or FAQ links.
   - **Account/Financial/Security (Escalate):** Requires private user credentials or backend database lookups via Direct Message (DM).
3. **Mutually Exclusive & Comprehensive:** A customer message maps to exactly one primary intent. In cases of multi-intent queries, priority is given to **security > billing > playback bug > general feedback**.

---

## 2. Intent Taxonomy & Grounding

### 1. `playback_audio_issue`
* **Definition:** Customer experiences issues streaming music, sudden track pauses, skipping, stuttering, or malfunctioning playback controls (shuffle, repeat, volume, scrobbling).
* **Historical Brand Resolution:** Recommends restarting device, reinstalling the app, clearing cache, or checking battery optimization settings.
* **Triage Action:** `auto_handle`
* **Real Examples from Data:**
  - *"can you fix this bug on the app where my music automatically pauses every 0.2 seconds without me even touching it? thx"* (Tweet #1067259)
  - *"when i have it on shuffle it turns off when the song is done and just plays in order and the repeat lights up but doesn't repeat"* (Tweet #850)
  - *"done it, and it still won't scrobble."* (Tweet #968809)

---

### 2. `offline_downloads_issue`
* **Definition:** Tracks or playlists downloaded for offline listening are missing, greyed out, won't play without an internet connection, or were unexpectedly removed.
* **Historical Brand Resolution:** Shares the official support guide link on "Downloads unexpectedly removed" and instructs user to verify SD card / storage permissions and login activity.
* **Triage Action:** `auto_handle`
* **Real Examples from Data:**
  - *"When @SpotifyCares randomly deletes your downloads 👌👌"* (Tweet #974974)
  - *"This happens only on the phone. Just checked on my computer and I'm able to listen to these songs."* (Tweet #373744)
  - *"half my downloaded songs say they aren't downloaded when I go offline"*

---

### 3. `app_crash_performance`
* **Definition:** The Spotify client application crashes to desktop/home screen, freezes on startup, causes device overheating, or becomes unresponsive after an OS update.
* **Historical Brand Resolution:** Requests exact OS version, device model, and app build number; acknowledges known platform regressions under investigation.
* **Triage Action:** `auto_handle`
* **Real Examples from Data:**
  - *"needs an update. Crashing on Pixel XL when sharing a track"* (Tweet #987355)
  - *"The app freezes completely whenever I click 'create similar playlist' on macOS"* (Tweet #323066)
  - *"Spotify keeps shutting down every time I open it on iOS 11"*

---

### 4. `content_catalog_request`
* **Definition:** Inquiries regarding why specific tracks, albums, or artists are unavailable, release dates for new music, or how to locate clean vs. explicit versions.
* **Historical Brand Resolution:** Explains music licensing and rights management, directs users to artist management or the Spotify Community music request hub.
* **Triage Action:** `auto_handle`
* **Real Examples from Data:**
  - *"how do we get the clean versions of our music...?"* (Tweet #1097489)
  - *"i just want the old logic mixtapes on Spotify. if u guys really care then add them plzzzz"* (Tweet #821804)
  - *"will you have got7 and day6 on spotify soon?"* (Tweet #574713)

---

### 5. `billing_payment_dispute`
* **Definition:** Unauthorized charges, continuing subscription billing after account cancellation, failure to apply student or promotional discounts, or payment method rejections.
* **Historical Brand Resolution:** Brand **never** discusses billing in public tweets; immediately escalates to human agents via private Direct Message (DM) to protect financial privacy.
* **Triage Action:** `escalate`
* **Escalation Reason:** Financial transaction inquiry requiring sensitive user account access and billing verification.
* **Real Examples from Data:**
  - *"why are you still charging my paypal after I've cancelled my account & disconnected my paypal from spotify payments?"* (Tweet #450877)
  - *"I haven't changed my payment details since I got my new card and you guys continue to have issues."* (Tweet #647130)
  - *"I keep being charged full subscription fees even though I'm registered as a student?"* (Tweet #149361)

---

### 6. `account_access_security`
* **Definition:** Inability to log in, forgotten credentials, password reset link failures, CSRF token validation errors, or suspected unauthorized account takeovers.
* **Historical Brand Resolution:** Immediately escalates to human support via DM to verify account ownership backstage.
* **Triage Action:** `escalate`
* **Escalation Reason:** Sensitive security credential issue requiring account ownership verification.
* **Real Examples from Data:**
  - *"every time I try to reset password it says 'The CSRF token is invalid. Please try to resubmit the form.'"* (Tweet #106339)
  - *"Anyone having problems with their app telling them their password is incorrect and the website timing out so you can’t reset password?"* (Tweet #997208)
  - *"all my playlists disappear is there anyway a lad could get them back??? Pls send help"* (Tweet #949005)

---

### 7. `subscription_plan_family`
* **Definition:** Issues managing Premium Family or Premium Duo subscription tiers, where invited family members still appear as "Free" accounts or invite links fail address verification.
* **Historical Brand Resolution:** Escalates to human agent in DM to verify matching physical addresses and family plan owner status.
* **Triage Action:** `escalate`
* **Escalation Reason:** Multi-user subscription linkage requires backend address and member verification.
* **Real Examples from Data:**
  - *"I currently am paying for the family plan but the 2 people I have on my account cannot sign in"* (Tweet #856194)
  - *"need help with family account showing one user as free. Can’t get to work."* (Tweet #964412)
  - *"My husband pays a monthly fee but when we log in his Facebook shows not premium Mine says not premium"* (Tweet #652030)

---

### 8. `feedback_or_complaint`
* **Definition:** Expressive venting, criticism of algorithmic recommendations (Time Capsule, Discover Weekly), frustration with customer support response times, or general feedback with no actionable technical bug.
* **Historical Brand Resolution:** Empathetic acknowledgement thanking the customer for their perspective, de-escalating frustration, and offering to pass feedback to the engineering team.
* **Triage Action:** `auto_handle`
* **Real Examples from Data:**
  - *"my time capsule playlist is absolute crapppp, first time the algorithm hasn't worked"* (Tweet #235214)
  - *"you guys suck! Who in there mind would pay for spotify when you guys have no contact number. That's a joke, lol."* (Tweet #312675)
  - *"I'd have a higher chance getting Ruvic to answer his phone then for @SpotifyCares to reply"* (Tweet #573776)

---

## 3. Decision Matrix Summary

| Intent Label | Handling Mode | Primary Resolution Mechanism |
|---|---|---|
| `playback_audio_issue` | **Auto-Handle** | Technical troubleshooting (restart, reinstall, clear cache) |
| `offline_downloads_issue` | **Auto-Handle** | Offline storage guide & re-sync guidance |
| `app_crash_performance` | **Auto-Handle** | App/OS version inquiry & bug diagnostics |
| `content_catalog_request` | **Auto-Handle** | Licensing policy explanation & music request links |
| `billing_payment_dispute` | **Escalate to Human** | Private DM for payment method / refund verification |
| `account_access_security` | **Escalate to Human** | Private DM for identity & credential restoration |
| `subscription_plan_family` | **Escalate to Human** | Private DM for multi-user plan & address reconciliation |
| `feedback_or_complaint` | **Auto-Handle** | Empathetic de-escalation & feedback logging |

