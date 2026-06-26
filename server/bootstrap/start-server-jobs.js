const runStartupMaintenance = async ({
  enqueueAnalyticsCompactionJob,
  isAutoUploadReorganizationOnStartupEnabled,
  logger = console,
  runAutoUploadReorganization,
  runStartupSecuritySanitization,
} = {}) => {
  try {
    if (typeof runStartupSecuritySanitization === "function") {
      runStartupSecuritySanitization();
      logger.log?.("[server] startup security sanitization completed");
    }
  } catch (error) {
    logger.error?.(
      `[server] startup security sanitization failed: ${String(error?.message || error)}`,
    );
  }

  try {
    if (typeof enqueueAnalyticsCompactionJob === "function") {
      await enqueueAnalyticsCompactionJob({ trigger: "startup" });
      logger.log?.("[server] startup analytics compaction enqueued");
    }
  } catch (error) {
    logger.error?.(
      `[server] startup analytics compaction failed: ${String(error?.message || error)}`,
    );
  }

  if (isAutoUploadReorganizationOnStartupEnabled) {
    try {
      if (typeof runAutoUploadReorganization === "function") {
        await runAutoUploadReorganization({ trigger: "startup" });
        logger.log?.("[server] startup upload reorganization completed");
      }
    } catch (error) {
      logger.error?.(
        `[server] startup upload reorganization failed: ${String(error?.message || error)}`,
      );
    }
  }
};

export const startServerJobs = ({
  ANALYTICS_COMPACTION_INTERVAL_MS,
  OPERATIONAL_ALERTS_SCHEDULER_POLL_MS,
  WEBHOOK_WORKER_POLL_INTERVAL_MS,
  analyticsCompactionState,
  enqueueAnalyticsCompactionJob,
  httpServer,
  isAutoUploadReorganizationOnStartupEnabled,
  isMaintenanceMode,
  listenPort,
  logger = console,
  onListening,
  operationalAlertsWebhookState,
  rateLimiter,
  runAutoUploadReorganization,
  runOperationalAlertsSchedulerTick,
  runStartupSecuritySanitization,
  runWebhookDeliveryWorkerTick,
  webhookDeliveryWorkerState,
} = {}) => {
  httpServer.listen(listenPort, () => {
    logger.log?.(
      `[server] listening on :${listenPort} (data_source=db, maintenance=${isMaintenanceMode})`,
    );
    setImmediate(() => {
      void runStartupMaintenance({
        enqueueAnalyticsCompactionJob,
        isAutoUploadReorganizationOnStartupEnabled,
        logger,
        runAutoUploadReorganization,
        runStartupSecuritySanitization,
      });
    });
    if (typeof onListening === "function") {
      setImmediate(() => {
        void onListening();
      });
    }
    analyticsCompactionState.timer = setInterval(() => {
      void enqueueAnalyticsCompactionJob({ trigger: "interval" }).catch(() => undefined);
    }, ANALYTICS_COMPACTION_INTERVAL_MS);
    analyticsCompactionState.timer.unref?.();
    logger.log?.(
      `[server] analytics compaction scheduled every ${ANALYTICS_COMPACTION_INTERVAL_MS}ms`,
    );
    webhookDeliveryWorkerState.timer = setInterval(() => {
      void runWebhookDeliveryWorkerTick();
    }, WEBHOOK_WORKER_POLL_INTERVAL_MS);
    webhookDeliveryWorkerState.timer.unref?.();
    logger.log?.(`[server] webhook worker scheduled every ${WEBHOOK_WORKER_POLL_INTERVAL_MS}ms`);
    setImmediate(() => {
      void runWebhookDeliveryWorkerTick();
    });
    operationalAlertsWebhookState.timer = setInterval(() => {
      void runOperationalAlertsSchedulerTick();
    }, OPERATIONAL_ALERTS_SCHEDULER_POLL_MS);
    operationalAlertsWebhookState.timer.unref?.();
    logger.log?.(
      `[server] operational alerts scheduler scheduled every ${OPERATIONAL_ALERTS_SCHEDULER_POLL_MS}ms`,
    );
    setImmediate(() => {
      void runOperationalAlertsSchedulerTick();
    });
  });

  httpServer.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      logger.error?.(
        `[server] Port ${listenPort} is already in use. Stop the existing process or run "npm run dev" to perform automatic cleanup. code=${String(error.code)}`,
      );
      process.exit(1);
      return;
    }
    logger.error?.(
      `[server] Failed to start HTTP server on :${listenPort}. ${String(error?.stack || error?.message || "Unknown error")}`,
    );
    process.exit(1);
  });

  httpServer.on("close", () => {
    if (analyticsCompactionState.timer) {
      clearInterval(analyticsCompactionState.timer);
      analyticsCompactionState.timer = null;
    }
    if (webhookDeliveryWorkerState.timer) {
      clearInterval(webhookDeliveryWorkerState.timer);
      webhookDeliveryWorkerState.timer = null;
    }
    if (operationalAlertsWebhookState.timer) {
      clearInterval(operationalAlertsWebhookState.timer);
      operationalAlertsWebhookState.timer = null;
    }
    void rateLimiter.close();
  });
};

export default startServerJobs;
