import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { ZodError, ZodSchema } from "zod";

type HandlerContext = {
  params: Record<string, string>;
  session: Awaited<ReturnType<typeof getServerSession>>;
};

type ApiHandler = (
  req: Request,
  context: HandlerContext
) => Promise<NextResponse>;

interface RouteConfig {
  requireAuth?: boolean;
  requireTeam?: boolean;
  rateLimit?: boolean;
  schema?: ZodSchema;
}

/**
 * Wraps an API route handler with common middleware:
 * - Authentication check
 * - Request body validation with Zod
 * - Error handling
 */
export function withHandler(
  handler: ApiHandler,
  config: RouteConfig = {}
): ApiHandler {
  return async (req: Request, context: HandlerContext) => {
    try {
      // Authentication check
      if (config.requireAuth) {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
          return NextResponse.json(
            { success: false, error: "Unauthorized" },
            { status: 401 }
          );
        }
        context.session = session;
      }

      // Request body validation
      if (config.schema && req.method !== "GET" && req.method !== "DELETE") {
        const body = await req.json();
        const result = config.schema.safeParse(body);
        if (!result.success) {
          return NextResponse.json(
            {
              success: false,
              error: "Validation failed",
              details: result.error.flatten().fieldErrors,
            },
            { status: 400 }
          );
        }
      }

      // Execute handler
      return await handler(req, context);
    } catch (error) {
      console.error("API Error:", error);

      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: "Validation failed",
            details: error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Creates a success response.
 */
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Creates an error response.
 */
export function errorResponse(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Creates a paginated response.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return NextResponse.json({
    success: true,
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}