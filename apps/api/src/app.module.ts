import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TodosModule } from './todos/todos.module';
import { AdminModule } from './admin/admin.module';
import { CategoriesModule } from './categories/categories.module';
import { SettingsModule } from './settings/settings.module';
import { AuditModule } from './audit/audit.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { RemarksModule } from './remarks/remarks.module';
import { OcrModule } from './ocr/ocr.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { FieldLibraryModule } from './field-library/field-library.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    BootstrapModule,
    UsersModule,
    AuthModule,
    TodosModule,
    AdminModule,
    CategoriesModule,
    SettingsModule,
    AuditModule,
    AttachmentsModule,
    OcrModule,
    RemarksModule,
    WorkflowsModule,
    FieldLibraryModule,
  ],
})
export class AppModule {}
