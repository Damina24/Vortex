import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { ProfileForm } from "@/components/settings/profile-form";
import { PasswordForm } from "@/components/settings/password-form";
import { CreditCard, KeyRound, Shield, Users } from "lucide-react";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      creditsBalance: true,
      subscriptionTier: true,
      createdAt: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: user.id },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { members: true } },
        },
      },
    },
  });

  const profileUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account, security, and workspace.
        </p>
      </div>

      {/* Account */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Account</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border p-6">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-vortex-500" />
              <h3 className="font-semibold">Profile</h3>
            </div>
            <div className="mt-6 space-y-6">
              <AvatarUpload user={profileUser} />
              <ProfileForm user={profileUser} />
            </div>
          </div>

          <div className="rounded-xl border p-6">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-vortex-500" />
              <h3 className="font-semibold">Password</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Change the password used to sign in with your email.
            </p>
            <div className="mt-6">
              <PasswordForm />
            </div>
          </div>
        </div>
      </section>

      {/* Workspace */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Workspace</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border p-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-vortex-500" />
              <h3 className="font-semibold">Team</h3>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="truncate font-medium">{membership?.team.name ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Slug</dt>
                <dd className="font-mono text-xs">{membership?.team.slug ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Your role</dt>
                <dd className="font-medium capitalize">{membership?.role ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Members</dt>
                <dd className="font-medium">{membership?.team._count.members ?? 0}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border p-6">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-vortex-500" />
              <h3 className="font-semibold">Subscription</h3>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium capitalize">{user.subscriptionTier}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Credits</dt>
                <dd className="text-lg font-bold">{user.creditsBalance}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Member since</dt>
                <dd className="font-medium">
                  {new Date(user.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-dashed p-6">
            <h3 className="font-semibold">Preferences</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Notifications, integrations, and API keys are coming next.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}