# Auto Offer Enroller (Chrome Extension)

A Chrome extension that automates enrolling in credit card merchant offers by programmatically clicking offer tiles and enrollment modals.

Currently supports **Citi** and **Chase** merchant offers.

---

## Features

- Automatically enrolls in all available merchant offers
- Skips offers that are already enrolled
- Progress tracking via popup UI
- Start / stop controls
- Handles lazy-loaded content via auto-scrolling
- **Multi-provider support** - automatically detects Citi or Chase
- Extensible architecture for adding more providers

---

## How It Works

1. Injects a content script into supported credit card offer pages
2. Automatically detects which provider you're using (Citi or Chase)
3. Detects merchant offer tiles on the page
4. Skips offers that are already enrolled (checkmark/success indicator)
5. Clicks each unenrolled offer tile
6. Enrolls via the modal dialog
7. Closes the modal and moves to the next offer
8. Reports progress back to the popup UI

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

1. Log into your credit card account (Citi or Chase)
2. Navigate to the merchant offers page
   - **Citi**: Usually found under "Rewards" or "Thank You Rewards"
   - **Chase**: Navigate to Chase Offers section
3. Open the extension popup
4. Click **Start**
5. The extension will:
   - Automatically detect your provider
   - Scroll to load all offers
   - Enroll in each eligible offer
   - Show progress in real time
6. Click **Stop** at any time to halt execution

---

## Supported Providers

| Provider | Status | Detection |
|---------|--------|-----------|
| Citi    | ✅ Supported | Auto-detects citi.com URLs |
| Chase   | ✅ Supported | Auto-detects chase.com URLs |

---

## Project Structure

```
.
├── manifest.json      # Chrome extension manifest (MV3)
├── content.js         # Page automation logic with provider detection
├── popup.html         # Popup UI
├── popup.js           # Popup logic & messaging
├── background.js      # Background service worker
└── README.md
```

---

## Technical Details

### Provider Architecture

The extension uses a provider-based architecture that allows easy addition of new credit card providers:

```javascript
const PROVIDERS = {
  CITI: {
    name: 'Citi',
    detectUrl: () => window.location.hostname.includes('citi.com'),
    selectors: { /* Citi-specific selectors */ },
    isEnrolled: (tile) => { /* Citi enrollment check */ }
  },
  CHASE: {
    name: 'Chase',
    detectUrl: () => window.location.hostname.includes('chase.com'),
    selectors: { /* Chase-specific selectors */ },
    isEnrolled: (tile) => { /* Chase enrollment check */ }
  }
};
```

### Key Differences Between Providers

| Feature | Citi | Chase |
|---------|------|-------|
| Tile Selector | `.tile-content` | `[data-cy="commerce-tile"]` |
| Enrolled Indicator | `[aria-label^="Enrolled"]` | `[data-cy="offer-tile-alert-container-success"]` |
| Modal Selector | `.cds-modal-content` | `[role="dialog"]` |
| Enroll Button Text | "Enroll in Offer" | "Activate" or "Add offer" |

---

## Important Notes

- This extension does not bypass authentication
- It only automates actions you could perform manually
- DOM structure changes by providers may break functionality
- Use at your own risk and discretion
- The extension automatically detects which provider you're using
- If you navigate to an unsupported site, you'll see an error message

---

## Roadmap

- [x] Chase offer support
- [x] Provider abstraction layer
- [ ] American Express support
- [ ] Discover support
- [ ] Capital One support
- [ ] Per-provider enable/disable toggles
- [ ] Smarter retry logic
- [ ] Chrome Web Store release

---

## Adding New Providers

To add support for a new credit card provider:

1. Add a new provider object to the `PROVIDERS` constant in `content.js`
2. Define the provider's selectors for tiles, enrollment indicators, and modals
3. Implement the `detectUrl` and `isEnrolled` functions
4. Test thoroughly on the provider's offers page

Example:
```javascript
AMEX: {
  name: 'American Express',
  detectUrl: () => window.location.hostname.includes('americanexpress.com'),
  selectors: {
    tile: '.offer-card',
    enrolledIndicator: '.enrolled-badge',
    // ... other selectors
  },
  isEnrolled: (tile) => !!tile.querySelector('.enrolled-badge')
}
```

---

## Troubleshooting

**Extension doesn't detect my provider:**
- Make sure you're on the offers page of a supported provider
- Check the browser console for detection messages

**Offers aren't being enrolled:**
- Check if the provider's website structure has changed
- Open browser console and look for error messages
- The extension may need updating if the provider changed their HTML

**Progress bar not updating:**
- Make sure the popup is open while the extension runs
- Check that you have the latest version of the extension

---

## Disclaimer

This project is not affiliated with or endorsed by Citi, Chase, or any financial institution.

Use responsibly and in accordance with the terms of service of the websites you interact with.