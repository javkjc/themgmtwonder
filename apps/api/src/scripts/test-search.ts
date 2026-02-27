import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SearchService } from '../search/search.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const searchService = app.get(SearchService);

    console.log('Testing semantic search query: "invoice total"');
    try {
        const results = await searchService.searchExtractions('invoice total', undefined, undefined, undefined, 5);
        console.log(`Found ${results.results.length} results.`);
        console.log(JSON.stringify(results.results, null, 2));
    } catch (error) {
        console.error('Search failed', error);
    }

    await app.close();
}

bootstrap();
