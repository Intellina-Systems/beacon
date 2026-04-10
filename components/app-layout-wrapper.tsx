import { BeaconLayout } from './beacon-layout'

interface AppLayoutWrapperProps {
  children: React.ReactNode
}

export async function AppLayoutWrapper({ children }: AppLayoutWrapperProps) {
  return <BeaconLayout>{children}</BeaconLayout>
}
