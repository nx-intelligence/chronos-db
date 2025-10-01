# 📦 NPM Publishing Guide - Unified Data Manager

**Package:** `unified-data-manager`  
**Version:** 1.0.0  
**Status:** ✅ Ready to publish  

---

## ✅ **PACKAGE IS READY!**

**Build Status:** ✅ PASSING  
**TypeScript:** ✅ No errors  
**Outputs:** ✅ ESM + CJS + Types  
**Dependencies:** ✅ All installed  
**Examples:** ✅ Working  

---

## 📋 **PRE-PUBLISH CHECKLIST**

- [x] Package builds successfully (`npm run build`)
- [x] TypeScript compilation passes
- [x] ESM and CJS outputs generated
- [x] Type definitions (.d.ts) included
- [x] `package.json` properly configured
- [x] README.md exists
- [x] LICENSE file exists (MIT)
- [x] Examples work
- [x] No hardcoded credentials in code
- [x] `.gitignore` excludes sensitive files

---

## 🚀 **STEPS TO PUBLISH TO NPM**

### **Step 1: Create NPM Account** (if you don't have one)

```bash
# Go to https://www.npmjs.com/signup
# Or use CLI:
npm adduser
```

---

### **Step 2: Login to NPM**

```bash
npm login

# You'll be prompted for:
# - Username
# - Password
# - Email
# - One-time password (if 2FA enabled)
```

---

### **Step 3: Verify Package Name is Available**

```bash
npm view unified-data-manager

# If you get "npm ERR! 404" - good! Name is available
# If package exists - you need to choose a different name or scope it
```

---

### **Step 4: (Optional) Use a Scoped Package**

If `unified-data-manager` is taken, use your own scope:

```bash
# Update package.json name:
{
  "name": "@sagente/unified-data-manager",  // ← Your scope
  "version": "1.0.0",
  ...
}
```

---

### **Step 5: Final Build**

```bash
# Make sure everything is built
npm run build

# Verify dist/ folder exists with files:
ls -lh dist/
# Should see:
# - index.js (CJS)
# - index.mjs (ESM)
# - index.d.ts (Types)
# - index.d.cts (Types for CJS)
```

---

### **Step 6: Test Package Locally** (Optional but recommended)

```bash
# Create a test project in another directory
cd /tmp
mkdir test-udm
cd test-udm
npm init -y

# Install your package locally
npm install /Users/ami/Documents/code/sagente/unified-data-manager

# Test it
node -e "import('unified-data-manager').then(udm => console.log('✅ Package loads!', Object.keys(udm)))"
```

---

### **Step 7: Publish to NPM!**

```bash
cd /Users/ami/Documents/code/sagente/unified-data-manager

# Dry run first (see what will be published)
npm publish --dry-run

# Review the output - make sure:
# - dist/ folder is included
# - node_modules/ is excluded
# - examples/ and tests/ are excluded (optional)

# Publish for real!
npm publish

# If using scoped package:
npm publish --access public
```

---

### **Step 8: Verify Publication**

```bash
# Check on NPM
npm view unified-data-manager

# Or visit:
https://www.npmjs.com/package/unified-data-manager
```

---

### **Step 9: Install and Use!**

```bash
# In any project:
npm install unified-data-manager

# Use it:
import { initUnifiedDataManager } from 'unified-data-manager';
```

---

## 📝 **WHAT GETS PUBLISHED**

Based on your `package.json` "files" field, these get published:

```json
"files": [
  "dist",           ← Build outputs (required!)
  "README.md",      ← Documentation
  "LICENSE",        ← License file
  "CHANGELOG.md"    ← Version history
]
```

**Automatically excluded:**
- `node_modules/`
- `src/` (source code - only dist/ is needed)
- `.udm-storage/`
- `examples/` (unless in "files")
- `tests/` (unless in "files")
- `.git/`

---

## ⚙️ **PACKAGE.JSON CONFIGURATION**

Your current setup is **perfect** for NPM:

```json
{
  "name": "unified-data-manager",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",      ← CJS entry
  "module": "dist/index.mjs",   ← ESM entry
  "types": "dist/index.d.ts",   ← TypeScript types
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "engines": {
    "node": ">=18.0.0"  ← Minimum Node version
  }
}
```

---

## 🔐 **SECURITY CHECKLIST**

Before publishing, make sure:

- [ ] No hardcoded credentials in code ✅ (already clean)
- [ ] No `.env` files in package ✅
- [ ] No test credentials in examples ✅ (using user's MongoDB)
- [ ] `.gitignore` properly configured ✅
- [ ] No API keys in package ✅

---

## 📚 **POST-PUBLISH**

### **Version Updates:**

```bash
# For patches (1.0.0 → 1.0.1)
npm version patch
npm publish

# For minor (1.0.0 → 1.1.0)
npm version minor
npm publish

# For major (1.0.0 → 2.0.0)
npm version major
npm publish
```

### **Unpublish** (if needed within 72 hours):

```bash
npm unpublish unified-data-manager@1.0.0
```

---

## 🎯 **QUICK PUBLISH COMMAND**

```bash
# One-liner to publish:
cd /Users/ami/Documents/code/sagente/unified-data-manager && \
npm run build && \
npm publish --access public

# That's it!
```

---

## 📊 **AFTER PUBLISHING**

Users can install with:

```bash
npm install unified-data-manager
```

And use immediately:

```javascript
import { initUnifiedDataManager } from 'unified-data-manager';

const udm = initUnifiedDataManager({
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: {
    enabled: true,
    basePath: './data',
  },
  // ... rest of config
});

const ops = udm.with({ dbName: 'myapp', collection: 'users' });
await ops.create({ name: 'John', email: 'john@example.com' });
```

---

## ✅ **YOU'RE READY!**

**Current status:**
- ✅ Package builds successfully
- ✅ All features implemented
- ✅ Working examples
- ✅ Clean code (no credentials)
- ✅ Proper package.json
- ✅ MIT License
- ✅ Good documentation

**Just run:**
```bash
npm login    # (if not logged in)
npm publish --access public
```

**And you're live on NPM!** 🚀

---

## 🆘 **TROUBLESHOOTING**

### **"Package name already taken"**

Solution: Use a scoped package
```json
"name": "@your-username/unified-data-manager"
```

### **"You must sign in"**

```bash
npm login
```

### **"Payment required"**

Scoped packages require paid plan OR use `--access public`:
```bash
npm publish --access public
```

### **"Files missing"**

Make sure `dist/` exists:
```bash
npm run build
ls dist/
```

---

**🎊 Your package is ready to publish!**

Total time to publish: ~2 minutes

