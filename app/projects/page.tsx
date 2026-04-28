import { redirect } from 'next/navigation'
import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { ChevronRight, FolderKanban, Github, Zap } from 'lucide-react'
import { db } from '@/lib/db/client'
import { products } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateProductButton } from '@/components/products/create-product-button'

export default async function ProjectsPage() {
  const session = await getServerSession()
  if (!session?.user) {
    redirect('/')
  }

  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      clientVertical: products.clientVertical,
      updatedAt: products.updatedAt,
      linearConnectionCount: sql<number>`(select count(*) from product_linear_connections where product_linear_connections.product_id = ${products.id})::int`,
      githubRepositoryCount: sql<number>`(select count(*) from product_github_repositories where product_github_repositories.product_id = ${products.id})::int`,
      activeIssueCount: sql<number>`(
        select count(*)
        from linear_issues
        where linear_issues.user_id = ${session.user.id}
          and linear_issues.linear_project_id in (
            select product_linear_connections.linear_project_id
            from product_linear_connections
            where product_linear_connections.product_id = ${products.id}
          )
          and (linear_issues.status_type is null or linear_issues.status_type not in ('completed','cancelled'))
      )::int`,
    })
    .from(products)
    .where(eq(products.userId, session.user.id))
    .orderBy(desc(products.updatedAt))

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select the product you are operating, then connect Linear and GitHub under it.
          </p>
        </div>
        <CreateProductButton />
      </div>

      {productRows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FolderKanban className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Create your first product</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Products are the top-level home for Linear work, GitHub activity, signals, and future insights.
              </p>
            </div>
            <CreateProductButton />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {productRows.map((product) => (
            <Link key={product.id} href={`/projects/${product.id}`}>
              <Card className="cursor-pointer transition-colors hover:bg-accent/30">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base font-medium">{product.name}</CardTitle>
                      {product.description && (
                        <CardDescription className="mt-1 line-clamp-2">{product.description}</CardDescription>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 pt-0">
                  {product.clientVertical && <Badge variant="outline">{product.clientVertical}</Badge>}
                  <Badge variant="secondary">
                    <Zap className="mr-1 h-3 w-3" />
                    {product.linearConnectionCount} Linear
                  </Badge>
                  <Badge variant="secondary">
                    <Github className="mr-1 h-3 w-3" />
                    {product.githubRepositoryCount} repos
                  </Badge>
                  <Badge variant="secondary">{product.activeIssueCount} active issues</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
