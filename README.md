# דרייב-צפייה — צפייה בתיקיות Google Drive משותפות

אתר סטטי יפה ונוח להצגת תכני וידאו מתוך תיקיות Google Drive משותפות — חיפוש, ניווט בתיקיות משנה, צפייה בנגן מוטמע, והורדה ישירה. מותאם מלא למובייל, RTL, מצב כהה/בהיר.

## ✨ תכונות

- **עדכון יומי אוטומטי** — GitHub Actions סורק את התיקיות ומעדכן את המניפסט
- **היררכיית תיקיות** — עץ תיקיות משנה מתקפל בסרגל הצד, עם ניקוד קבצים לכל תיקייה
- **חיפוש חכם** — Fuse.js fuzzy search בעברית, עם הדגשת תוצאות
- **סינון לפי סוג** — וידאו / אודיו / תמונות / מסמכים
- **Load-more** — טעינה מצטברת במקום פאג'ינציה (מתאים לאלפי קבצים)
- **נגן וידאו מוטמע** — Google Drive Preview, כולל הורדה ישירה
- **תגי מידע** — משך וידאו, איכות (HD/4K), תג "חדש" לקבצים טריים
- **מצב כהה/בהיר** — עם זיכרון העדפה
- **PWA-ready** — ניתן להתקנה, RTL מלא

## 🏗️ ארכיטקטורה

```
GitHub Actions (יומי 09:00) ──► סריקת Drive (OAuth/API Key)
        │                            │
        │                   folder_{id}.json + index.json
        ▼                            ▼
    GitHub Pages ◄────────── static manifest קבצים
```

- **סקריפט הסריקה** (`scripts/generate-manifest.js`) — סורק רקורסיבית, כולל נתיב יחסי לכל קובץ, משך וידאו, גודל נורמלי
- **האתר** (`index.html` + `js/`) — Vanilla JS, ללא תלויות כבדות, Fuse.js בלבד מ-CDN

## ⚙️ הגדרה

### Secrets ב-GitHub (Settings → Secrets and variables → Actions)

| Secret | תיאור |
|--------|-------|
| `DRIVE_CLIENT_ID` | OAuth Client ID (מומלץ, עובד גם על תיקיות פרטיות) |
| `DRIVE_CLIENT_SECRET` | OAuth Client Secret |
| `DRIVE_REFRESH_TOKEN` | Refresh Token (הפקה: `scripts/get-refresh-token.js`) |
| `DRIVE_API_KEY` | API Key (גיבוי — תיקיות ציבוריות בלבד) |
| `DRIVE_FOLDER_IDS` | מזהי תיקיות האב, מופרדים בפסיקים |

### GitHub Pages

Settings → Pages → Deploy from branch → `main` → `/ (root)`

## 📜 הבהרה משפטית

**אנו לא בעלי התכנים המוצגים באתר.** התכנים מוצגים מתיקיות Google Drive שהגישה אליהן משותפת. כל האחריות על התכנים חלה על מעלה הקבצים המקורי. הגלישה באתר מהווה הסכמה לתנאים אלו.

## 📧 יצירת קשר

מעוניין להוסיף תיקיית Drive לאתר, לטובת כולם? שלח מייל: **srhhc6@gmail.com**
