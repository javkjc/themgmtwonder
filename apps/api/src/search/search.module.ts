import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { DbModule } from '../db/db.module';
import { AuditModule } from '../audit/audit.module';

@Module({
    imports: [DbModule, AuditModule],
    controllers: [SearchController],
    providers: [SearchService],
})
export class SearchModule { }
