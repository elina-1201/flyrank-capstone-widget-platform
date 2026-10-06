import { Injectable } from '@nestjs/common';

const GEO_TIMEOUT_MS = 1500;

export interface GeoResult {
    countryCode: string;
    region: string | null;
    city: string | null;
    geoProvider: 'ip-api.com' | 'ipapi.co';
}

@Injectable()
export class GeoService {
    async enrich(ip: string): Promise<GeoResult | null> {
        const fromIpApi = await this.tryIpApi(ip);
        if (fromIpApi) {
            return fromIpApi;
        }
        return this.tryIpapiCo(ip);
    }

    private async tryIpApi(ip: string): Promise<GeoResult | null> {
        const data = await this.getJson(
            `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,regionName,city`,
        );
        if (
            !data ||
            data.status !== 'success' ||
            typeof data.countryCode !== 'string'
        ) {
            return null;
        }
        return {
            countryCode: data.countryCode,
            region: typeof data.regionName === 'string' ? data.regionName : null,
            city: typeof data.city === 'string' ? data.city : null,
            geoProvider: 'ip-api.com',
        };
    }

    private async tryIpapiCo(ip: string): Promise<GeoResult | null> {
        const data = await this.getJson(
            `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
        );
        if (
            !data ||
            data.error === true ||
            typeof data.country_code !== 'string'
        ) {
            return null;
        }
        return {
            countryCode: data.country_code,
            region: typeof data.region === 'string' ? data.region : null,
            city: typeof data.city === 'string' ? data.city : null,
            geoProvider: 'ipapi.co',
        };
    }

    private async getJson(url: string): Promise<Record<string, unknown> | null> {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
            });
            if (!response.ok) {
                return null;
            }
            return (await response.json()) as Record<string, unknown>;
        } catch {
            return null;
        }
    }
}
