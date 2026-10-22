# Arbetsyta för ig-composer: Node, SUSHI och git. Arbetsytan monteras från
# repot (docker-compose.yml), så att studions ändringar hamnar i dina filer.
FROM node:22-bookworm

RUN npm install -g fsh-sushi@3.21.0 \
 && git config --system --add safe.directory /arbetsyta

WORKDIR /arbetsyta
ENV STUDIO_VARD=0.0.0.0 \
    STUDIO_PORT=4900

EXPOSE 4900 4800
# Studion startar även om bygget har fel; felen syns i studion och i loggen.
CMD ["sh", "-c", "npm ci --prefix verktyg && (node verktyg/ig-composer.mjs bygg || true) && node verktyg/ig-composer.mjs studio"]
