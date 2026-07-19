# Utterlog Plugins

Place plugin directories here. Each plugin should have:

```
plugins/
  my-plugin/
    plugin.json    — manifest (name, version, description, author)
    index.ts       — plugin entry point
```

## plugin.json format

```json
{
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample plugin",
  "author": "Author Name",
  "hooks": ["comment:before", "post:render"]
}
```

## Plugin API (planned)

Plugins can hook into:
- `comment:before` — Before comment is submitted
- `comment:after` — After comment is submitted
- `post:render` — When post content is rendered
- `page:head` — Inject into page head
- `page:footer` — Inject into page footer
