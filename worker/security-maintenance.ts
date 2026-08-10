import type { Env } from "./env";
import { performScheduledSecurityMaintenance } from "./services/security-operations";

export function scheduleSecurityMaintenance(
  controller: ScheduledController,
  env: Env,
  context: ExecutionContext,
): void {
  context.waitUntil(
    performScheduledSecurityMaintenance(env, Math.floor(controller.scheduledTime / 1000))
      .then((result) => {
        console.log(JSON.stringify({
          level: "info",
          operation: "security.maintenance",
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          result,
        }));
      })
      .catch((error) => {
        console.error(JSON.stringify({
          level: "error",
          operation: "security.maintenance.failed",
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          message: error instanceof Error ? error.message : String(error),
        }));
        throw error;
      }),
  );
}
