import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { APP_NAME, APP_VERSION, AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return platform info with version and endpoints', () => {
      const info = appController.getInfo();

      expect(info.name).toBe(APP_NAME);
      expect(info.version).toBe(APP_VERSION);
      expect(info.endpoints).toEqual(expect.any(Array));
      expect(info.endpoints.length).toBeGreaterThan(0);
    });
  });

  describe('health', () => {
    it('should report ok when the database answers', async () => {
      await expect(appController.health()).resolves.toEqual({
        status: 'ok',
        db: 'ok',
      });
    });
  });
});
