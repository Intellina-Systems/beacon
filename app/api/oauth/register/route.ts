import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { registerClient, ClientRegistrationError } from '@/lib/oauth/clients'

// RFC 7591 Dynamic Client Registration — deliberately unauthenticated (see
// lib/oauth/clients.ts for why that's safe). Only the fields Beacon's flow
// actually needs are read; the rest of a client's metadata is ignored rather
// than rejected, per spec.
const registerSchema = z.object({
  client_name: z.string().min(1).max(200),
  redirect_uris: z.array(z.string()).min(1),
})

export async function POST(req: NextRequest): Promise<Response> {
  const parsed = registerSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_client_metadata', error_description: 'client_name and redirect_uris are required' },
      { status: 400 },
    )
  }

  try {
    const { clientId } = await registerClient({
      clientName: parsed.data.client_name,
      redirectUris: parsed.data.redirect_uris,
    })
    return Response.json(
      {
        client_id: clientId,
        client_name: parsed.data.client_name,
        redirect_uris: parsed.data.redirect_uris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof ClientRegistrationError) {
      return Response.json({ error: 'invalid_client_metadata', error_description: error.message }, { status: 400 })
    }
    throw error
  }
}
