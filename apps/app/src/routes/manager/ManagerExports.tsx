import { ExportsPanel } from '@pupitre/ui'

/** Spec 182 for managers: their members' data only. */
export function ManagerExports() {
  return <ExportsPanel basePath="/api/manager/exports" />
}
