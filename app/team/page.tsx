import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AddMemberButton } from '@/components/add-member-button'

export default async function TeamPage() {
  const session = await getServerSession()
  if (!session?.user) {
    redirect('/')
  }

  const teamMembers = await db.select().from(members).where(eq(members.userId, session.user.id)).orderBy(members.name)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <AddMemberButton />
      </div>

      {teamMembers.length === 0 ? (
        <div className="text-center py-12 border rounded-md border-dashed">
          <p className="text-muted-foreground">No team members yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Connect Linear and sync to import your workspace members, or add them manually.
          </p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-40">Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-48">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-36">GitHub</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {teamMembers.map((member) => (
                <tr key={member.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <Link href={`/team/${member.id}`} className="flex items-center gap-3">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                        <AvatarFallback className="text-xs">
                          {member.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{member.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <Link href={`/team/${member.id}`} className="block">
                      {member.role ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <Link href={`/team/${member.id}`} className="block">
                      {member.email ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.githubUsername ? (
                      <span>@{member.githubUsername}</span>
                    ) : (
                      <Link href={`/team/${member.id}`} className="block">
                        —
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
