import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SearchService } from '../search/search.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const searchService = app.get(SearchService);

    console.log('Testing semantic search query: "invoice total"');
    try {
        // Provide a test user scope for tenant-isolated semantic search.
        const results = await searchService.searchExtractions(
            '00000000-0000-0000-0000-000000000000',
            'invoice total',
            undefined,
            undefined,
            undefined,
            5,
        );
        console.log(`Found ${results.results.length} results.`);
        console.log(JSON.stringify(results.results, null, 2));
    } catch (error) {
        console.error('Search failed', error);
    }

    await app.close();
}

bootstrap();
