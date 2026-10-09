"use client";

import { useLinkStatus } from "next/link";

export default function StudentLinkStatus() {
  const { pending } = useLinkStatus();
  return <span className={`student-link-status${pending ? " is-pending" : ""}`} aria-hidden="true" />;
}
