import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
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
import { FieldLibraryModule } from './field-library/field-library.module';
import { BaselineModule } from './baseline/baseline.module';
import { MlModule } from './ml/ml.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
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
    FieldLibraryModule,
    BaselineModule,
    MlModule,
  ],
})
export class AppModule {}
