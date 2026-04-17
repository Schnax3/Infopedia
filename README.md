# Infompedia — Setup Guide

A Wikipedia-style platform with Firebase Realtime Database, role-based access (admin / mod / user), page creation, discussions, moderation tools, and more.

---

## 1. Firebase Project Setup

### Create the project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Open or create your **infopedia-62afe** project
3. Enable **Authentication** → Sign-in method → **Email/Password**
4. Enable **Realtime Database** (already done — your DB URL is configured)

### Get your API keys
1. In the Firebase Console, go to **Project Settings** (gear icon)
2. Under "Your apps", add a **Web app** if you haven't already
3. Copy the config object — you need:
   - `apiKey`
   - `authDomain`
   - `messagingSenderId`
   - `appId`

### Update main.js
Replace the placeholder values in `firebaseConfig` inside `main.js`:
```js
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "infopedia-62afe.firebaseapp.com",
  databaseURL: "https://infopedia-62afe-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "infopedia-62afe",
  storageBucket: "infopedia-62afe.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## 2. Firebase Database Rules

In the Firebase Console → Realtime Database → Rules, paste:

```json
{
  "rules": {
    "articles": {
      ".read": true,
      "$slug": {
        ".write": "auth != null"
      }
    },
    "users": {
      ".read": "auth != null",
      "$uid": {
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "discussions": {
      ".read": true,
      ".write": "auth != null"
    },
    "logs": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "applications": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "revisions": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

> For production, tighten these rules using custom claims or server-side validation.

---

## 3. Create Your First Admin

After your first user registers:
1. Go to Firebase Console → Realtime Database
2. Navigate to `users/<your-uid>`
3. Change `role` from `"user"` to `"admin"`

All future role changes can be done from the **Admin Panel** in the app.

---

## 4. Running Locally

Because this app uses ES Modules and Firebase SDK v10, you **must serve it over HTTP** (not open the file directly).

**Option A — VS Code Live Server**
Install the "Live Server" extension and click "Go Live".

**Option B — Python**
```bash
cd /path/to/infompedia
python3 -m http.server 8080
# Open http://localhost:8080
```

**Option C — Node.js**
```bash
npx serve .
```

---

## 5. Feature Summary

| Feature | Who can do it |
|---|---|
| Read articles | Everyone |
| Create articles | Logged-in users |
| Edit own articles | Author |
| Edit any article | Mod + Admin |
| View page logs | Mod + Admin |
| Open/close discussions | Mod + Admin |
| Delete messages | Mod + Admin |
| Ban/unban users | Mod + Admin |
| Delete articles | Admin only |
| Change user roles | Admin only |
| Review mod applications | Mod + Admin |
| Apply for mod | Regular users |

---

## 6. Wiki Markup Reference

| Markup | Result |
|---|---|
| `==Section Heading==` | Section header (appears in ToC) |
| `===Sub-heading===` | Sub-section header |
| `'''bold'''` | **bold** |
| `''italic''` | *italic* |
| `[[Article Title]]` | Link to article |
| `[[Slug\|Display Text]]` | Link with custom text |
| `* item` | Bullet list item |
| `# item` | Numbered list item |