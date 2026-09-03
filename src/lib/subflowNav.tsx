"use client";

import { createContext, useContext } from "react";

export interface SubflowNav {
  openSubflow: (subflowId: string, label: string) => void;
}

const noop: SubflowNav = { openSubflow: () => {} };

export const SubflowNavContext = createContext<SubflowNav>(noop);

export function useSubflowNav() {
  return useContext(SubflowNavContext);
}
