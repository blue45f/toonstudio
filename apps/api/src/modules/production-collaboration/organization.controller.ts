import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Headers, Inject, Param, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { AcceptOrganizationDto, CreateOrganizationDto, OrganizationCommandSchema, OrganizationParamsDto, PreviewOrganizationInviteDto } from "./organization.dto";
import { OrganizationRepository } from "./organization.repository";

function actor(value: string | undefined): string {
  // Existing session middleware injects a verified user after removing client identity headers.
  if (!value) throw new ForbiddenException("로그인이 필요합니다.");
  return value;
}
@Controller("/production/organizations")
export class OrganizationController {
  constructor(@Inject(OrganizationRepository) private readonly repository: OrganizationRepository) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@Headers("x-user-id") userId?: string) { return this.repository.list(actor(userId)); }
  @Post()
  @Header("Cache-Control", "private, no-store")
  create(@Body(new ZodValidationPipe(CreateOrganizationDto)) body: CreateOrganizationDto,
    @Headers("x-user-id") userId?: string) { return this.repository.create(actor(userId), body); }
  @Post("/accept-invite")
  @Header("Cache-Control", "private, no-store")
  accept(@Body(new ZodValidationPipe(AcceptOrganizationDto)) body: AcceptOrganizationDto,
    @Headers("x-user-id") userId?: string) { return this.repository.accept(actor(userId), body); }
  @Post("/preview-invite")
  @Header("Cache-Control", "private, no-store")
  previewInvite(@Body(new ZodValidationPipe(PreviewOrganizationInviteDto)) body: PreviewOrganizationInviteDto,
    @Headers("x-user-id") userId?: string) { return this.repository.previewInvite(actor(userId), body); }
  @Get("/:organizationId")
  @Header("Cache-Control", "private, no-store")
  detail(@Param(new ZodValidationPipe(OrganizationParamsDto)) params: OrganizationParamsDto,
    @Headers("x-user-id") userId?: string) { return this.repository.detail(actor(userId), params.organizationId); }
  @Post("/:organizationId/commands")
  @Header("Cache-Control", "private, no-store")
  command(@Param(new ZodValidationPipe(OrganizationParamsDto)) params: OrganizationParamsDto,
    @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const parsed = OrganizationCommandSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("요청 형식이 올바르지 않습니다.");
    return this.repository.command(actor(userId), params.organizationId, parsed.data);
  }
}
