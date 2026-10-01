"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { demoGetProject, DemoStorageError } from "@/lib/demo-store";
import type { Project } from "@/lib/types";
import { ProjectEditor } from "./ProjectEditor";

export function DemoProjectPage({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      setProject(demoGetProject(id));
    } catch (reason) {
      setError(
        reason instanceof DemoStorageError
          ? reason.message
          : "Demo data could not be loaded.",
      );
      setProject(null);
    }
  }, [id]);
  if (error)
    return (
      <div className="workspace-main">
        <div className="empty-state">
          <div className="section-kicker">Demo workspace unavailable</div>
          <p>{error}</p>
          <Link className="button-secondary" href="/workspace">
            Back to workspace
          </Link>
        </div>
      </div>
    );
  if (project === undefined)
    return (
      <div className="workspace-main">
        <div className="empty-state">
          <div className="section-kicker">Loading demo project</div>
          <p>Reading this browser’s saved workspace…</p>
        </div>
      </div>
    );
  if (!project)
    return (
      <div className="workspace-main">
        <div className="empty-state">
          <div className="section-kicker">Project not found here</div>
          <p>
            This demo keeps projects in this browser. Return to the workspace
            and open a project from this device.
          </p>
          <Link className="button-secondary" href="/workspace">
            Back to workspace
          </Link>
        </div>
      </div>
    );
  return <ProjectEditor demoMode project={project} />;
}
