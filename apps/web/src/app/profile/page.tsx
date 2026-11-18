import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApi } from "@/lib/server";
import type { User } from "@/lib/types";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

interface Readiness {
  masteryPercent: number;
  mastered: number;
  totalQuestions: number;
  mocksTaken: number;
  readiness: number | null;
  mocksNeeded: number;
}

export default async function ProfilePage() {
  const me = await serverApi<{ user: User }>("/me");
  if (!me.ok || me.data.user.isGuest) redirect("/sign-in?next=/profile");
  const r = await serverApi<Readiness>("/me/readiness");
  const user = me.data.user;
  return (
    <main className="container page" id="main">
      <div className="page-head">
        <h1 className="page-title">Profile</h1>
        <p className="page-lead">
          Signed in as {user.email}
          {user.role !== "learner" ? `, ${user.role}` : ""}.
        </p>
      </div>
      <div className="recap">
        <ProfileForm user={user} />
        {r.ok && (
          <section className="panel" aria-labelledby="ready">
            <h2 className="panel-head" id="ready">
              Exam readiness
            </h2>
            <p>
              Mastered {r.data.mastered} of {r.data.totalQuestions} questions ({r.data.masteryPercent}%).
            </p>
            <p>
              {r.data.readiness === null
                ? `Take ${r.data.mocksNeeded} more mock exam${r.data.mocksNeeded === 1 ? "" : "s"} to see your readiness score.`
                : `Readiness: ${r.data.readiness}%`}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
