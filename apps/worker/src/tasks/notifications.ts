import type { Task } from "graphile-worker";

import { processNotifications } from "../notifications";

export const dispatchNotifications: Task = async () => {
  await processNotifications();
};
