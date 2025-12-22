# Auto Offer Enroller (Chrome Extension)

A Chrome extension that automates enrolling in credit card merchant offers by programmatically clicking offer tiles and enrollment modals.

Currently supports **Citi merchant offers**, with plans to add additional providers (e.g. Chase).

---

## Features

- Automatically enrolls in all available merchant offers
- Skips offers that are already enrolled
- Progress tracking via popup UI
- Start / stop controls
- Handles lazy-loaded content via auto-scrolling
- Designed to be extensible for multiple providers

---

## How It Works

1. Injects a content script into supported credit card offer pages
2. Detects merchant offer tiles on the page
3. Skips offers that are already enrolled (green checkmark)
4. Clicks each offer tile
5. Enrolls via the modal dialog
6. Closes the modal and moves to the next offer
7. Reports progress back to the popup UI

All actions are triggered manually by the user via the extension popup.

---

## Installation (Local / Development)

1. Clone the repository:

    ```bash
    git clone https://github.com/YOUR_USERNAME/auto-offer-enroller.git
    cd auto-offer-enroller
    ```

2. Open Chrome and navigate to:

   ```
   chrome://extensions
   ```

3. Enable **Developer mode** (top-right)

4. Click **Load unpacked**

5. Select the project folder containing `manifest.json`

The extension should now appear in your toolbar.

---

## Usage

1. Log into your credit card account (e.g. Citi)
2. Navigate to the merchant offers page
3. Open the extension popup
4. Click **Start**
5. The extension will:
   - Scroll to load all offers
   - Enroll in each eligible offer
   - Show progress in real time
6. Click **Stop** at any time to halt execution

---

## Supported Providers

| Provider | Status |
|---------|--------|
| Citi    | ✅ Supported |
| Chase   | ⏳ Planned |

---

## Project Structure

"""
.
├── manifest.json      # Chrome extension manifest (MV3)
├── content.js         # Page automation logic
├── popup.html         # Popup UI
├── popup.js           # Popup logic & messaging
└── README.md
"""

---

## Important Notes

- This extension does not bypass authentication
- It only automates actions you could perform manually
- DOM structure changes by providers may break functionality
- Use at your own risk and discretion

---

## Roadmap

- [ ] Chase offer support
- [ ] Provider abstraction layer
- [ ] Per-provider enable/disable toggles
- [ ] Smarter retry logic
- [ ] Chrome Web Store release

---

## Disclaimer

This project is not affiliated with or endorsed by Citi, Chase, or any financial institution.

Use responsibly and in accordance with the terms of service of the websites you interact with.
"""
