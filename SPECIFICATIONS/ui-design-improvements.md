# UI Design Improvements

**Status:** Planning
**Branch:** `feature/ui-design-improvements`
**Target:** Phase 5 (Polish)

---

## Overview

Apply the clean, minimal design system from hultberg.org to Ansible AI Reader, improving the visual design and user experience of the login page, homepage, and summaries list.

**Reference site:** https://hultberg.org/admin
**Reference repo:** https://github.com/mannepanne/hultberg-org

---

## Design System (from hultberg.org)

### Typography
- **Font family:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
- **Base font size:** 16px
- **Line height:** 1.5-1.6
- **Headings:** Simple, not too large (1.4-2em)

### Color Palette
- **Primary blue:** `#007bff` (buttons), `#0d6efd` (links)
- **Dark:** `#212529` (header background, dark text)
- **Gray scale:**
  - Text: `#333`, `#495057`, `#6c757d`
  - Backgrounds: `#f8f9fa`, `#f1f3f5`
  - Borders: `#ced4da`, `#f1f3f5`
- **Success:** Background `#d4edda`, text `#155724`
- **Error:** Background `#f8d7da`, text `#dc3545`
- **Warning:** Background `#fff3cd`, text `#856404`

### Layout Principles
- **Centered content:** Max-width containers (500px for forms, 960px for tables)
- **Generous whitespace:** Comfortable padding and margins
- **Card-based:** White backgrounds with subtle shadows
- **Clean tables:** Header row styling, hover states, good spacing

### Component Patterns
- **Buttons:** Rounded (4px), bold text, full-width on forms, blue primary color
- **Inputs:** Clean borders, focus states with blue outline
- **Tables:** Light gray headers, white rows, subtle hover effect
- **Status badges:** Pill-shaped, colored backgrounds with matching text
- **Header bar:** Dark background (#212529), white/light gray text, user email + logout

---

## Pages to Redesign

### 1. Home/Landing Page (`/`)

**Current state:** Minimal
**Target:** Dual-purpose landing page with integrated login

**Behavior:**
- **Not authenticated:** Show welcome message + login form
- **Authenticated:** Show welcome message + "View Summaries" button

**Design:**
- Center the content (max-width: 500px, margin: 80px auto)
- **Welcome section:**
  - App name/logo: "Ansible AI Reader"
  - Tagline: "AI-powered reading triage for your Readwise library"
  - Brief description (2-3 sentences)
- **Login form** (when not authenticated):
  - Clean heading: "Login"
  - Styled email input with focus states
  - Bold blue "Send Login Link" button
  - Light gray "How it works" info box below form
  - Error/success messages with colored backgrounds
- **Authenticated view:**
  - Welcoming message with user email
  - Prominent "View Summaries" button
  - Optional: Quick stats (e.g., "You have 23 unread summaries")

**Reference:** `/tmp/hultberg-org/src/routes/adminLogin.ts` lines 27-89 (styles)

---

### 2. Summaries Page (`/summaries`)

**Current state:** Basic table, functional but unstyled
**Target:** Clean dashboard with card-based layout

**Changes:**

#### Header Bar
- Dark background (#212529)
- "Ansible AI Reader" branding on left (clickable, goes to `/`)
- **"Sync" button** in header (blue, loading states)
- User email displayed
- "Logout" button on right

#### Content Area
- Light gray background (#f8f9fa)
- Centered content (max-width: 1200px for comfortable card grid)
- Responsive grid: 1 column (mobile) → 2 columns (tablet) → 3 columns (desktop)

#### Summary Card Design
Each card is a white container with shadow, containing:

**Card structure:**
```
┌─────────────────────────────┐
│ 📄 Title (bold, blue link)  │
│                             │
│ Summary text preview...     │
│ [Expand] (if truncated)     │
│                             │
│ 🏷️ tag1  tag2  tag3         │
│                             │
│ ─────────────────────────   │
│ Source · Author · 2,500w    │
│ ⚠️ Truncated (if >30k)      │
│                             │
│ [Archive] [Open in Reader]  │
└─────────────────────────────┘
```

**Card details:**
- **Title:** Bold (font-weight: 600), blue link (#0d6efd), wraps to 2 lines max with ellipsis
- **Summary:** 3-4 lines preview, gray text (#495057), line-clamp
- **Expand link:** Small blue text, shows full summary in modal or inline expansion
- **Tags:** Pill-shaped badges, light colored backgrounds (different colors per tag)
- **Metadata row:** Small gray text (#6c757d), centered dot separators
- **Truncated badge:** Orange/warning color if content was truncated
- **Actions:** Two buttons - Archive (subtle) and Open in Reader (blue)

#### Card Styling
- Background: white (#fff)
- Border radius: 6px
- Box shadow: `0 1px 3px rgba(0,0,0,.1)`
- Padding: 16px
- Hover: Subtle lift effect (shadow increases)
- Gap between cards: 16px

#### Empty State
- "No summaries yet. Sync your items from Readwise Reader to get started."
- Prominent "Sync Now" button

#### Loading States
- Show spinner/loading indicator during sync
- Disable sync button while syncing
- Show progress if possible (e.g., "Syncing: 15/25 items processed")

---

## Technical Implementation

### Approach
- **Inline styles** (like hultberg.org) for simplicity, or
- **Tailwind utility classes** (already in project)
- Extract common styles into components if needed

### File Structure
```
src/app/
  login/
    page.tsx           # Styled login page
  page.tsx             # Home/landing page
  summaries/
    page.tsx           # Summaries list (currently exists)
    SummariesContent.tsx  # Main component to restyle
```

### Components to Create/Update
1. `Header.tsx` - Dark header bar with branding, user info, logout
2. `SummaryCard.tsx` or `SummaryRow.tsx` - Individual summary display
3. `SyncButton.tsx` - Styled sync button with loading states
4. `StatusBadge.tsx` - Reusable colored badge (tags, truncated indicator)

---

## UX Improvements

### Sync Experience
- **Before:** Button with no feedback
- **After:** Loading state, progress indication, success/error messages

### Summary Readability
- **Before:** Plain text dump
- **After:** Clean typography, clear hierarchy, scannable layout

### Mobile Responsiveness
- All pages should work well on mobile
- Table may need to switch to card layout on small screens
- Forms should be touch-friendly (adequate spacing)

---

## Out of Scope (for this phase)
- Settings page
- Notes and ratings (Phase 5.2)
- Advanced filtering/sorting (future)
- Keyboard shortcuts
- Dark mode

---

## Acceptance Criteria

- [ ] Login page matches hultberg.org aesthetic
- [ ] Summaries page has clean table/card layout
- [ ] Header bar with branding and logout
- [ ] Sync button with loading states
- [ ] Tag badges with colored backgrounds
- [ ] Truncated content indicator visible
- [ ] Mobile-responsive layout
- [ ] Empty states with clear CTAs
- [ ] Error/success messages styled
- [ ] All pages use consistent design system

---

## Implementation Steps

1. **Extract design tokens** - Create shared styles/variables
2. **Redesign login page** - Apply hultberg.org styles
3. **Create Header component** - Dark header bar
4. **Redesign summaries list** - Table or cards (decision needed)
5. **Add loading states** - Sync button, page load
6. **Polish details** - Spacing, hover states, mobile
7. **Test on production** - Verify on ansible.hultberg.org

---

## Design Decisions ✅

1. **Home page behavior:** Welcome page with login form (landing page style)
2. **Summaries layout:** **Cards** (more modern, mobile-friendly)
3. **Sync button location:** **In header bar** (always accessible)
4. **Summary preview:** **Truncated with "Expand" link** (easier to scan)
5. **Actions placement:** Always visible on cards

---

## Timeline

**Estimated effort:** 1-2 sessions (4-6 hours)
**Testing:** 30 minutes on production site
**PR review:** Standard review process
