const express = require("express");
const router = new express.Router();
const auth = require("../middleware/auth");
const pool = require("../db/pool");

router.post("/api/update-geometry", auth, async (req, res) => {
  const { layerName, id, geometryType, coordinates } = req.body;

  try {
    const schema = layerName.substring(0, 3);

    let geojson;

    switch (geometryType) {
      case "POINT":
        geojson = {
          type: "Point",
          coordinates: coordinates[0],
        };
        break;

      case "LINESTRING":
        geojson = {
          type: "LineString",
          coordinates: coordinates,
        };
        break;

      case "MULTILINESTRING":
        geojson = {
          type: "MultiLineString",
          coordinates: [coordinates],
        };
        break;

      case "POLYGON":
        geojson = {
          type: "Polygon",
          coordinates: [coordinates],
        };
        break;

      case "MULTIPOLYGON":
        geojson = {
          type: "MultiPolygon",
          coordinates: [[coordinates]],
        };
        break;

      default:
        return res.status(400).json({
          message: `Unsupported geometry type: ${geometryType}`,
        });
    }

    const sql = `
      UPDATE ${schema}.${layerName}
      SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 32640)
      WHERE id = $2
      RETURNING id;
    `;

    const result = await pool.query(sql, [JSON.stringify(geojson), id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Feature not found",
      });
    }

    res.json({
      message: "Geometry updated successfully",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("Update geometry error:", error);

    res.status(500).json({
      message: "Failed to update geometry",
      error: error.message,
    });
  }
});

router.post("/api/feature-info", auth, async (req, res) => {
  const { layerName, id } = req.body;

  const schema = layerName.substring(0, 3);

  const sql = `
    SELECT
      t.*,

      GeometryType(geom) AS "geometryType",

      ST_AsGeoJSON(ST_Force3D(geom))::json AS geometry

    FROM ${schema}.${layerName} t
    WHERE id = $1;
  `;

  const result = await pool.query(sql, [id]);

  if (!result.rows.length) {
    return res.status(404).json({ message: "Feature not found" });
  }

  const feature = result.rows[0];

  let coordinates = [];

  switch (feature.geometryType) {
    case "POINT":
      coordinates = [feature.geometry.coordinates];
      break;

    case "MULTIPOINT":
      coordinates = feature.geometry.coordinates;
      break;

    case "LINESTRING":
      coordinates = feature.geometry.coordinates;
      break;

    case "MULTILINESTRING":
      coordinates = feature.geometry.coordinates.flat();
      break;

    case "POLYGON":
      coordinates = feature.geometry.coordinates[0];
      break;

    case "MULTIPOLYGON":
      coordinates = feature.geometry.coordinates.flatMap(
        (polygon) => polygon[0],
      );
      break;

    default:
      coordinates = [];
  }

  feature.coordinates = coordinates;

  delete feature.geometry;

  res.json(feature);
});

router.get("/api/layers", auth, async (req, res) => {
  try {
    const sql = `
      SELECT
        alias,
        color,
        visible,
        geometry_type,
        layer_name,
        schema_name,
        renderer_type,
        editable,
        min_zoom,
        max_zoom
      FROM public.layers_list
      ORDER BY alias
    `;

    const result = await pool.query(sql);

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to load layers",
    });
  }
});

router.post("/api/query-with-extent", auth, async (req, res) => {
  const { tiles, layerNames } = req.body;

  if (!tiles || !Array.isArray(tiles) || tiles.length === 0) {
    return res.status(400).json({
      error: "tiles array is required",
    });
  }

  if (!layerNames || !Array.isArray(layerNames) || layerNames.length === 0) {
    return res.status(400).json({
      error: "layerNames array is required",
    });
  }

  try {
    /*
      Create a VALUES list for all requested tiles.

      Example:

      VALUES
        ($1, $2, $3, $4, $5),
        ($6, $7, $8, $9, $10)

      tile_id, xmin, ymin, xmax, ymax
    */

    const tileValues = [];
    const tileParams = [];

    tiles.forEach((tile, index) => {
      const base = index * 5;

      tileValues.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
      );

      tileParams.push(tile.id, tile.xmin, tile.ymin, tile.xmax, tile.ymax);
    });

    /*
      Response structure:

      {
        "10_20": {
          oilpip: [],
          oilvav: []
        },

        "11_20": {
          oilpip: [],
          oilvav: []
        }
      }
    */

    const response = {};

    // Initialize every requested tile
    tiles.forEach((tile) => {
      response[tile.id] = {};
    });

    /*
      One query per layer.

      Each query checks the layer against ALL requested tiles.
    */

    const allQueries = layerNames.map(async (layerName) => {
      const schema = layerName.substring(0, 3).toLowerCase();

      let featureFields;

      if (layerName.endsWith("pip")) {
        featureFields = `
          f.id,
          f."Size",
          f.location_type,
          ST_AsGeoJSON(f.geom) AS geometry
        `;
      } else {
        featureFields = `
          f.id,
          ST_AsGeoJSON(f.geom) AS geometry
        `;
      }

      const query = `
        WITH requested_tiles (
          tile_id,
          xmin,
          ymin,
          xmax,
          ymax
        ) AS (
          VALUES
            ${tileValues.join(",")}
        ),

        tile_geometries AS (
          SELECT
            tile_id,
            ST_MakeEnvelope(
              xmin::double precision,
              ymin::double precision,
              xmax::double precision,
              ymax::double precision,
              32640
            ) AS geom
          FROM requested_tiles
        )

        SELECT
          t.tile_id,
          ${featureFields}
        FROM ${schema}.${layerName} f
        JOIN tile_geometries t
          ON f.geom && t.geom
      `;

      try {
        const result = await pool.query(query, tileParams);

        return {
          layerName,
          data: result.rows,
          error: null,
        };
      } catch (err) {
        return {
          layerName,
          data: [],
          error: err.message,
        };
      }
    });

    const completedQueries = await Promise.all(allQueries);

    /*
      Convert:

      [
        {
          tile_id: "10_20",
          id: 1,
          ...
        }
      ]

      into:

      response["10_20"]["oilpip"] = [...]
    */

    completedQueries.forEach(({ layerName, data, error }) => {
      if (error) {
        console.error(`Error querying ${layerName}:`, error);

        return;
      }

      data.forEach((row) => {
        const { tile_id, ...feature } = row;

        if (!response[tile_id]) {
          response[tile_id] = {};
        }

        if (!response[tile_id][layerName]) {
          response[tile_id][layerName] = [];
        }

        response[tile_id][layerName].push(feature);
      });
    });

    res.json(response);
  } catch (err) {
    console.error("Query with tiles failed:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
