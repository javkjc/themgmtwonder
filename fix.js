const fs = require('fs');
const file = 'c:\\todo-docker\\apps\\api\\src\\baseline\\baseline-management.service.ts';
let content = fs.readFileSync(file, 'utf8');

const s1Match = 'baselineTables,\n} from \'../db/schema\';';
const s1Rep = 'baselineTables,\n  documentTypeFields,\n} from \'../db/schema\';';
content = content.replace(s1Match, s1Rep);

const s1MatchW = 'baselineTables,\r\n} from \'../db/schema\';';
const s1RepW = 'baselineTables,\r\n  documentTypeFields,\r\n} from \'../db/schema\';';
content = content.replace(s1MatchW, s1RepW);

const s2Match = '        const activeLibraryFields = await this.dbs.db\n          .select()\n          .from(fieldLibrary)\n          .where(eq(fieldLibrary.status, \'active\'));';
const s2Rep = `        let activeLibraryFields;
        if (currentOcr.documentTypeId) {
          const rows = await this.dbs.db
            .select({ field: fieldLibrary })
            .from(documentTypeFields)
            .innerJoin(
              fieldLibrary,
              eq(documentTypeFields.fieldKey, fieldLibrary.fieldKey),
            )
            .where(
              and(
                eq(documentTypeFields.documentTypeId, currentOcr.documentTypeId),
                eq(fieldLibrary.status, 'active'),
              ),
            )
            .orderBy(documentTypeFields.sortOrder);
          activeLibraryFields = rows.map((r) => r.field);
        } else {
          activeLibraryFields = await this.dbs.db
            .select()
            .from(fieldLibrary)
            .where(eq(fieldLibrary.status, 'active'));
        }`;
content = content.replace(s2Match, s2Rep);

const s2MatchW = '        const activeLibraryFields = await this.dbs.db\r\n          .select()\r\n          .from(fieldLibrary)\r\n          .where(eq(fieldLibrary.status, \'active\'));';
const s2RepW = `        let activeLibraryFields;
        if (currentOcr.documentTypeId) {
          const rows = await this.dbs.db
            .select({ field: fieldLibrary })
            .from(documentTypeFields)
            .innerJoin(
              fieldLibrary,
              eq(documentTypeFields.fieldKey, fieldLibrary.fieldKey),
            )
            .where(
              and(
                eq(documentTypeFields.documentTypeId, currentOcr.documentTypeId),
                eq(fieldLibrary.status, 'active'),
              ),
            )
            .orderBy(documentTypeFields.sortOrder);
          activeLibraryFields = rows.map((r) => r.field);
        } else {
          activeLibraryFields = await this.dbs.db
            .select()
            .from(fieldLibrary)
            .where(eq(fieldLibrary.status, 'active'));
        }`.replace(/\n/g, '\r\n');
content = content.replace(s2MatchW, s2RepW);

fs.writeFileSync(file, content);
console.log('Successfully updated baseline-management.service.ts');
