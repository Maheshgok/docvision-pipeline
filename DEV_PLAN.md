# Invoice Processing Platform - Development Plan

## 🎯 **Project Overview**
Full rebuild of invoice processing system following tenant-isolated, job-driven, Pub/Sub-based architecture.

---

## 📋 **Phase 1: Foundation & Shared Infrastructure** 

### **1.1 Project Structure Setup** ⏱️ 2 days
- [ ] Create modular project structure
- [ ] Setup `/shared` folder for common utilities
- [ ] Setup individual service folders
- [ ] Create `/config` folder for environment configs
- [ ] Create `/prompts` folder for LLM templates
- [ ] Setup `/schemas` folder for data contracts

### **1.2 Shared Utilities Development** ⏱️ 3 days
- [ ] `shared/auth_utils.py` - Tenant/user validation middleware
- [ ] `shared/openai_utils.py` - Centralized OpenAI calls with latest API
- [ ] `shared/firestore_utils.py` - Tenant-scoped Firestore operations
- [ ] `shared/gcs_utils.py` - Tenant-scoped GCS operations
- [ ] `shared/pubsub_utils.py` - Pub/Sub publish/consume utilities
- [ ] `shared/validation_utils.py` - JSON schema validation
- [ ] `shared/error_handling.py` - Standardized error responses

### **1.3 Configuration & Security** ⏱️ 2 days
- [ ] Setup Google Secret Manager integration
- [ ] Create environment config templates
- [ ] Define secret rotation procedures
- [ ] Setup CORS configuration standards
- [ ] Create API response format standards

### **1.4 Data Contracts & Schemas** ⏱️ 2 days
- [ ] Define JSON schemas for all service interfaces
- [ ] Document tenant isolation data patterns
- [ ] Create validation schemas for OpenAI responses
- [ ] Define Pub/Sub message formats
- [ ] Create API documentation templates

---

## 📋 **Phase 2: Core Services Development**

### **2.1 Orchestrator Service** ⏱️ 3 days
**Path**: `/orchestrator-service`

- [ ] **Setup**
  - [ ] Lightweight Flask app with CORS
  - [ ] Tenant validation middleware
  - [ ] Secret Manager integration
  - [ ] Health check endpoint

- [ ] **Core Logic**
  - [ ] Job creation with tenant_id scoping
  - [ ] Firestore job document initialization  
  - [ ] Phase orchestration (extract → chunk → enrich → standardize → combine)
  - [ ] Error handling and retry logic

- [ ] **APIs**
  - [ ] `POST /process-invoice` - Initiate processing
  - [ ] `GET /jobs/{job_id}/status` - Job status
  - [ ] `GET /health` - Health check

### **2.2 Data Extractor Service** ⏱️ 4 days
**Path**: `/data-extractor-v2`

- [ ] **Setup**
  - [ ] Flask app with shared utilities
  - [ ] OpenAI client with latest API format
  - [ ] Prompt templates in external files

- [ ] **Extraction Logic**
  - [ ] Header extraction with GPT-4o
  - [ ] Line items extraction with GPT-4o
  - [ ] JSON validation and cleanup
  - [ ] Tenant-scoped result storage

- [ ] **Prompt Templates**
  - [ ] `prompts/header_extraction.txt`
  - [ ] `prompts/line_items_extraction.txt`

### **2.3 Chunk Dispatcher Service** ⏱️ 3 days
**Path**: `/chunk-dispatcher`

- [ ] **Setup**
  - [ ] Lightweight Flask app
  - [ ] Pub/Sub publisher utilities

- [ ] **Chunking Logic**
  - [ ] Split line items into chunks of 3-5 items
  - [ ] Token-budget based chunking
  - [ ] Deterministic chunk ID generation
  - [ ] Firestore chunk document creation

- [ ] **Pub/Sub Integration**
  - [ ] Publish chunks to enrichment topic
  - [ ] Include tenant context in messages
  - [ ] Error handling for failed publishes

### **2.4 Enrichment Worker Service** ⏱️ 5 days
**Path**: `/enrichment-worker`

- [ ] **Setup**
  - [ ] Pub/Sub pull subscription consumer
  - [ ] OpenAI client with batch processing
  - [ ] Stateless worker design

- [ ] **Processing Logic**
  - [ ] Receive chunk from Pub/Sub
  - [ ] Validate tenant context
  - [ ] Enrich 3-5 line items per call
  - [ ] Store enriched results in Firestore

- [ ] **Prompt Templates**
  - [ ] `prompts/business_enrichment.txt`
  - [ ] `prompts/expense_classification.txt`

### **2.5 Standardizer Service** ⏱️ 4 days
**Path**: `/field-standardizer-v2`

- [ ] **Setup**
  - [ ] Flask app with OpenAI integration
  - [ ] Field normalization logic

- [ ] **Standardization Logic**
  - [ ] Header canonicalization
  - [ ] Line item field normalization
  - [ ] Schema validation

### **2.6 Combiner Service** ⏱️ 3 days  
**Path**: `/data-combiner-v2`

- [ ] **Setup**
  - [ ] Flask app (no OpenAI dependency)
  - [ ] Output format generation

- [ ] **Combination Logic**
  - [ ] Join header + enriched line items
  - [ ] Generate CSV/JSON/XLSX outputs
  - [ ] Store final results in tenant-scoped GCS

---

## 📋 **Phase 3: Infrastructure & Deployment**

### **3.1 Pub/Sub Setup** ⏱️ 1 day
- [ ] Create Pub/Sub topics and subscriptions
- [ ] Configure dead letter queues
- [ ] Setup monitoring and alerting

### **3.2 Firestore Configuration** ⏱️ 2 days
- [ ] Update security rules for tenant isolation
- [ ] Create indexes for tenant-scoped queries
- [ ] Setup data retention policies

### **3.3 Cloud Storage Configuration** ⏱️ 1 day
- [ ] Configure tenant-scoped bucket structure
- [ ] Setup signed URL generation
- [ ] Configure lifecycle policies

### **3.4 Deployment Scripts** ⏱️ 2 days
- [ ] Docker configurations for all services
- [ ] Cloud Run deployment scripts
- [ ] Environment-specific config management
- [ ] min-instances configuration for heavy services

---

## 📋 **Phase 4: Frontend Integration**

### **4.1 Auth Service Updates** ⏱️ 2 days
- [ ] Add tenant_id resolution from tokens
- [ ] Update authentication flows
- [ ] Add tenant context validation

### **4.2 API Service Updates** ⏱️ 3 days
- [ ] Update all Firestore paths to tenant-scoped
- [ ] Modify upload flow for tenant context
- [ ] Update job status monitoring

### **4.3 Real-time Updates** ⏱️ 2 days
- [ ] Update Firestore listeners for tenant paths
- [ ] Add job progress indicators
- [ ] Handle chunk-based progress updates

---

## 📋 **Phase 5: Testing & Validation**

### **5.1 Unit Testing** ⏱️ 3 days
- [ ] Test shared utilities
- [ ] Test individual services
- [ ] Test tenant isolation

### **5.2 Integration Testing** ⏱️ 3 days
- [ ] Test end-to-end pipeline
- [ ] Test Pub/Sub workflows
- [ ] Test failure scenarios

### **5.3 Security Testing** ⏱️ 2 days
- [ ] Test tenant isolation
- [ ] Test authentication flows
- [ ] Test data access controls

---

## 📋 **Phase 6: Migration & Deployment**

### **6.1 Data Migration** ⏱️ 2 days
- [ ] Migrate existing user data to tenant model
- [ ] Update existing job records
- [ ] Validate data integrity

### **6.2 Production Deployment** ⏱️ 2 days
- [ ] Deploy all services to production
- [ ] Configure monitoring and alerting
- [ ] Setup backup and recovery

### **6.3 Cleanup** ⏱️ 1 day
- [ ] Remove old session-manager service
- [ ] Clean up old queue-enrichment-processor
- [ ] Update documentation

---

## 🗂️ **File Structure**

```
/shared
  ├── auth_utils.py
  ├── openai_utils.py  
  ├── firestore_utils.py
  ├── gcs_utils.py
  ├── pubsub_utils.py
  ├── validation_utils.py
  └── error_handling.py

/prompts
  ├── header_extraction.txt
  ├── line_items_extraction.txt
  ├── business_enrichment.txt
  └── expense_classification.txt

/schemas
  ├── job_schema.json
  ├── chunk_schema.json
  ├── extraction_schema.json
  └── enrichment_schema.json

/config
  ├── development.env
  ├── staging.env
  └── production.env

/orchestrator-service
/data-extractor-v2
/chunk-dispatcher  
/enrichment-worker
/field-standardizer-v2
/data-combiner-v2
```

---

## ⏱️ **Timeline Summary**

| Phase | Duration | Dependencies |
|-------|----------|-------------|
| **Phase 1: Foundation** | 9 days | None |
| **Phase 2: Core Services** | 22 days | Phase 1 |
| **Phase 3: Infrastructure** | 6 days | Phase 2 |
| **Phase 4: Frontend** | 7 days | Phase 3 |
| **Phase 5: Testing** | 8 days | Phase 4 |
| **Phase 6: Migration** | 5 days | Phase 5 |
| **Total** | **57 days** | Sequential |

---

## 🎯 **Success Criteria**

- [ ] **Tenant Isolation**: Complete data separation between tenants
- [ ] **Job Independence**: Processing continues regardless of user sessions  
- [ ] **Scalability**: Handles long invoices through chunking
- [ ] **Reliability**: Handles failures gracefully with retries
- [ ] **Performance**: Cold start issues eliminated on critical path
- [ ] **Security**: All secrets in Secret Manager, proper CORS
- [ ] **Maintainability**: Modular, well-documented, traceable changes

---

## 🚀 **Ready to Start**

**Next Action**: Begin Phase 1.1 - Project Structure Setup