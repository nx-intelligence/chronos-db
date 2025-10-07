# Chronos-DB v2.2.0 - Demo & Example Files

This directory contains comprehensive demos demonstrating all Chronos-DB features.

---

## 📁 Configuration Examples (JSON)

These are production-ready configuration examples:

| File | Description | Requirements |
|------|-------------|--------------|
| `aws-config.json` | AWS S3 production setup | AWS account, S3 bucket |
| `do-config.json` | DigitalOcean Spaces setup | DO account, Spaces |
| `minio-config.json` | MinIO local S3 setup | MinIO server |
| `dev-config.json` | Development setup | Local MinIO |
| `enterprise-security-config.json` | Enterprise multi-tenant | MongoDB cluster, S3 |

---

## 🎬 Interactive Demos (JavaScript)

### **No External Dependencies**

These demos work without MongoDB or S3:

| Demo | Features | Run Command |
|------|----------|-------------|
| `demo-deep-merge.js` | Deep merge utility, tiered merging | `node examples/demo-deep-merge.js` |

✅ **Status**: Working perfectly!

### **Requires MongoDB**

These demos require a running MongoDB instance at `mongodb://localhost:27017`:

| Demo | Features Demonstrated | Database Collections Created |
|------|----------------------|------------------------------|
| `demo-01-basic-crud.js` | CREATE, READ, UPDATE, DELETE, Versioning, Storage inspection | `users_head`, `users_ver`, `users_counter` |
| `demo-02-lineage-tracking.js` | parentId/originId tracking, _system fields, Data provenance | `raw-data_*`, `processed-data_*`, `enriched-data_*` |
| `demo-03-configurable-features.js` | Logical vs hard delete, Versioning on/off | `items_head`, `items_ver` (4 test scenarios) |
| `demo-04-versioning-restore.js` | Version history, Time-travel, Restore operations | `documents_head`, `documents_ver` |
| `demo-entity-relationships.js` | insertWithEntities, getWithEntities, Entity management | `orders_*`, `customers_*`, `products_*` |
| `demo-tiered-fetching.js` | getKnowledge, getMetadata, Tier merging | Knowledge & Metadata tier collections |
| `demo-analytics-unique.js` | Unique counting, One row per unique value | `events_head`, `cnt_total` (analytics) |

**To run these demos:**

```bash
# Start MongoDB
docker run -d -p 27017:27017 --name mongodb mongo:6

# Run any demo
node examples/demo-01-basic-crud.js

# Stop MongoDB
docker stop mongodb && docker rm mongodb
```

---

## 🎯 What Each Demo Shows

### **demo-deep-merge.js** ✅ (Works without MongoDB)
- Basic object merging
- Array union with deduplication
- Deep nested object merging
- Tiered merging (generic → domain → tenant)
- Null/undefined handling

**Key Learning**: How records from multiple tiers are intelligently combined

---

### **demo-01-basic-crud.js** (Requires MongoDB)
- CREATE with automatic versioning
- READ operations
- UPDATE with optimistic locking
- DELETE (logical vs hard)
- Database structure inspection (head, ver, counter collections)
- Storage layout inspection (JSON files per version)

**Key Learning**: How Chronos-DB stores data in MongoDB + filesystem/S3

---

### **demo-02-lineage-tracking.js** (Requires MongoDB)
- parentId/parentCollection tracking
- originId/originCollection tracking  
- Data provenance chains
- _system field structure
- Audit trail creation

**Key Learning**: How to track data lineage for compliance and debugging

---

### **demo-03-configurable-features.js** (Requires MongoDB)
- Logical delete ENABLED vs DISABLED
- Versioning ENABLED vs DISABLED
- 4 configuration scenarios tested
- Database differences shown

**Key Learning**: How configuration changes affect behavior

---

### **demo-04-versioning-restore.js** (Requires MongoDB)
- Automatic version creation
- Time-travel queries (read any version)
- Point-in-time queries
- Restore to previous version
- Version storage structure

**Key Learning**: How versioning and restore work

---

### **demo-entity-relationships.js** (Requires MongoDB)
- insertWithEntities: Auto-save related entities
- getWithEntities: Auto-fetch related entities
- Entity creation/update detection
- Referential integrity

**Key Learning**: How to manage relationships between entities

---

### **demo-tiered-fetching.js** (Requires MongoDB)
- getKnowledge with merge: false (fallback)
- getKnowledge with merge: true (combine tiers)
- getMetadata (same functionality)
- Tier priority: tenant → domain → generic

**Key Learning**: How to fetch and merge data across tiers

---

### **demo-analytics-unique.js** (Requires MongoDB)
- Counter rules with countUnique
- One row per unique value
- Real-time analytics updates
- getUniqueAnalytics API

**Key Learning**: How unique counting creates detailed analytics

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build the package
npm run build

# 3. Run a demo (no MongoDB needed)
node examples/demo-deep-merge.js

# 4. Run demos requiring MongoDB
# First start MongoDB:
docker run -d -p 27017:27017 --name mongodb mongo:6

# Then run any demo:
node examples/demo-01-basic-crud.js
node examples/demo-02-lineage-tracking.js
node examples/demo-entity-relationships.js

# Stop MongoDB when done:
docker stop mongodb && docker rm mongodb
```

---

## 📝 Notes

- All demos use **localStorage** for simplicity (no S3/Azure needed)
- Data is stored in `test-demo-*-data/` directories
- Each demo is self-contained and can run independently
- Demos automatically clean up on shutdown
- Full source code inspection included in database/storage inspection sections

---

## 🐛 Troubleshooting

**Error: "connect ECONNREFUSED 127.0.0.1:27017"**
- MongoDB is not running
- Start MongoDB: `docker run -d -p 27017:27017 mongo:6`

**Error: "Referenced spaces connection 'local-storage' does not exist"**
- Configuration validation requires spacesConnections even with localStorage
- All demos include a dummy spacesConnections entry

**Error: "Collection not found"**
- Normal on first run - collections are created automatically
- Run the demo again if needed

---

**All demos are production-quality code that can be adapted for your use case!**

