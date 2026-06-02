const REQUIRED_DEPENDENCY_KEYS = ["dataRepository"];

const assertRequiredDependencies = (dependencies = {}) => {
  const missing = REQUIRED_DEPENDENCY_KEYS.filter((key) => dependencies[key] === undefined);
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    `[data-repository-adapters-runtime] missing required dependencies: ${missing.sort().join(", ")}`,
  );
};

export const createDataRepositoryAdaptersRuntime = (dependencies = {}) => {
  assertRequiredDependencies(dependencies);

  const { dataRepository } = dependencies;

  const hasMethod = (methodName) =>
    Boolean(dataRepository) && typeof dataRepository[methodName] === "function";

  const callRepositoryMethod = (methodName, args = [], fallbackValue = null) => {
    if (!hasMethod(methodName)) {
      return fallbackValue;
    }
    return dataRepository[methodName](...args);
  };

  const loadSecurityEvents = () => callRepositoryMethod("loadSecurityEvents", [], []);
  const upsertSecurityEvent = (event) => callRepositoryMethod("upsertSecurityEvent", [event], null);

  const findUserIdentityRecord = (provider, providerSubject) =>
    callRepositoryMethod("findUserIdentityRecord", [provider, providerSubject], null);
  const findUserIdentityRecordsByEmail = (emailNormalized, options) =>
    callRepositoryMethod("findUserIdentityRecordsByEmail", [emailNormalized, options], []);
  const upsertUserIdentityRecord = (record) =>
    callRepositoryMethod("upsertUserIdentityRecord", [record], null);
  const writeUserIdentityRecords = (records) =>
    callRepositoryMethod("writeUserIdentityRecords", [records], []);

  const flushPersistQueue = async () =>
    callRepositoryMethod("flushPersistQueue", [], undefined);

  const loadAdminExportJobs = () => callRepositoryMethod("loadAdminExportJobs", [], []);
  const upsertAdminExportJob = (job) => callRepositoryMethod("upsertAdminExportJob", [job], null);

  const loadWebhookDeliveries = () => callRepositoryMethod("loadWebhookDeliveries", [], []);
  const findWebhookDelivery = (id) => callRepositoryMethod("findWebhookDelivery", [id], null);
  const upsertWebhookDelivery = (delivery) =>
    callRepositoryMethod("upsertWebhookDelivery", [delivery], null);
  const claimWebhookDelivery = async (options) =>
    callRepositoryMethod("claimWebhookDelivery", [options], null);
  const loadWebhookState = (key) => callRepositoryMethod("loadWebhookState", [key], null);
  const writeWebhookState = (key, data) =>
    callRepositoryMethod("writeWebhookState", [key, data], null);

  const loadEpubImportJobs = () => callRepositoryMethod("loadEpubImportJobs", [], []);
  const isEpubImportJobStorageAvailable = () =>
    callRepositoryMethod("isEpubImportJobStorageAvailable", [], false);
  const upsertEpubImportJob = (job) => callRepositoryMethod("upsertEpubImportJob", [job], null);

  const loadProjectImageImportJobs = () =>
    callRepositoryMethod("loadProjectImageImportJobs", [], []);
  const isProjectImageImportJobStorageAvailable = () =>
    callRepositoryMethod("isProjectImageImportJobStorageAvailable", [], false);
  const upsertProjectImageImportJob = (job) =>
    callRepositoryMethod("upsertProjectImageImportJob", [job], null);

  const loadProjectImageExportJobs = () =>
    callRepositoryMethod("loadProjectImageExportJobs", [], []);
  const isProjectImageExportJobStorageAvailable = () =>
    callRepositoryMethod("isProjectImageExportJobStorageAvailable", [], false);
  const upsertProjectImageExportJob = (job) =>
    callRepositoryMethod("upsertProjectImageExportJob", [job], null);

  const loadSecretRotations = () => callRepositoryMethod("loadSecretRotations", [], []);
  const appendSecretRotation = (entry) =>
    callRepositoryMethod("appendSecretRotation", [entry], null);

  return {
    appendSecretRotation,
    claimWebhookDelivery,
    findUserIdentityRecord,
    flushPersistQueue,
    findUserIdentityRecordsByEmail,
    findWebhookDelivery,
    isEpubImportJobStorageAvailable,
    isProjectImageExportJobStorageAvailable,
    isProjectImageImportJobStorageAvailable,
    loadAdminExportJobs,
    loadEpubImportJobs,
    loadProjectImageExportJobs,
    loadProjectImageImportJobs,
    loadSecretRotations,
    loadSecurityEvents,
    loadWebhookDeliveries,
    loadWebhookState,
    upsertAdminExportJob,
    upsertEpubImportJob,
    upsertProjectImageExportJob,
    upsertProjectImageImportJob,
    upsertSecurityEvent,
    upsertUserIdentityRecord,
    upsertWebhookDelivery,
    writeUserIdentityRecords,
    writeWebhookState,
  };
};

export default createDataRepositoryAdaptersRuntime;
