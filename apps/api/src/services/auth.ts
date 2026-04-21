import { appConfig } from '../config.js';

export function isAdminTokenValid(token: string | undefined) {
  if (!appConfig.updateToken) {
    return true;
  }

  return token === appConfig.updateToken;
}