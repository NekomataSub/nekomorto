import { type ReactNode, Suspense, useEffect, useState } from "react";

interface ClientMountedSuspenseProps {
  children: ReactNode;
  fallback: ReactNode;
}

const ClientMountedSuspense = ({ children, fallback }: ClientMountedSuspenseProps) => {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return fallback;
  }

  return <Suspense fallback={fallback}>{children}</Suspense>;
};

export default ClientMountedSuspense;
