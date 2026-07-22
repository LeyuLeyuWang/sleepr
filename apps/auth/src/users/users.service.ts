import {
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { GetUserDto } from './dto/get-user.dto';
import { UsersRepository } from './users.repository';
import { UserDocument } from '@app/common';

@Injectable()
export class UsersService {
  // TTL (seconds) for caching per-user lookups on the authenticate hot path.
  // 0 disables the cache, so every authenticated request hits MongoDB — used to
  // A/B measure the optimization against a single build.
  private readonly userCacheTtlMs: number;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.userCacheTtlMs =
      this.configService.get<number>('AUTH_USER_CACHE_TTL', 0) * 1000;
  }

  async create(createUserDto: CreateUserDto) {
    await this.validateCreateUserDto(createUserDto);
    return this.usersRepository.create({
      ...createUserDto,
      password: await bcrypt.hash(createUserDto.password, 10),
    });
  }

  private async validateCreateUserDto(createUserDto: CreateUserDto) {
    try {
      await this.usersRepository.findOne({ email: createUserDto.email });
    } catch (err) {
      return;
    }
    throw new UnprocessableEntityException('Email already exists.');
  }

  async verifyUser(email: string, password: string) {
    const user = await this.usersRepository.findOne({ email });
    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      throw new UnauthorizedException('Credentials are not valid.');
    }
    return user;
  }

  async getUser(getUserDto: GetUserDto) {
    // Every authenticated gateway request resolves the JWT's user here. Without
    // caching that is one MongoDB read per request; a short-TTL cache serves
    // repeat lookups from memory and removes the DB round-trip from the hot path.
    if (!this.userCacheTtlMs) {
      return this.usersRepository.findOne(getUserDto);
    }

    const cacheKey = `user:${getUserDto._id}`;
    const cached = await this.cacheManager.get<UserDocument>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.usersRepository.findOne(getUserDto);
    await this.cacheManager.set(cacheKey, user, this.userCacheTtlMs);
    return user;
  }

  async findAll() {
    return this.usersRepository.find({});
  }
}
