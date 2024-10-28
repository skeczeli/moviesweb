const express = require("express");
const sqlite3 = require("sqlite3");
const ejs = require("ejs");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt"); // hashing

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the "views" directory
app.use(express.static("views"));

// Middleware for parsing cookies and form data
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));

// Path completo de la base de datos movies.db
// Por ejemplo 'C:\\Users\\datagrip\\movies.db'
const db = new sqlite3.Database("movies.db");

// Configurar el motor de plantillas EJS
app.set("view engine", "ejs");

// Ruta para la página de inicio
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/users", (req, res) => {
  const user_id = req.cookies.user_id;

  // Renderizar la vista de "users" con el valor de user_id (si está presente)
  res.render("users", { user_id });
});

app.get("/user/:id", (req, res) => {
  const user_id = req.params.id;

  // Consulta SQL para obtener los detalles del usuario y sus reseñas
  const query = `
    SELECT users.user_id, users.username, users.name, users.email, 
           movie_user.review, movie_user.rating, movie.movie_id, movie.title
    FROM users
    JOIN movie_user ON users.user_id = movie_user.user_id
    JOIN movie ON movie_user.movie_id = movie.movie_id
    WHERE users.user_id = ?
  `;

  // Ejecutar la consulta
  db.all(query, [user_id], (err, userReviews) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error al cargar los datos del usuario.");
    } else if (userReviews.length === 0) {
      res.status(404).send("Usuario no encontrado o sin reseñas.");
    } else {
      res.render("user", { user: userReviews[0], reviews: userReviews });
    }
  });
});

app.get("/admin", (req, res) => {
  res.render("admin");
});

app.get("/auth_user", (req, res) => {
  res.render("auth_user"); // Renderiza la vista auth_user.ejs
});

app.get("/mod_rev", (req, res) => {
  const user_id = req.cookies.user_id;

  // Renderizar la vista de "users" con el valor de user_id (si está presente)
  res.render("mod_rev", { user_id });
});

app.get("/account", (req, res) => {
  const user_id = req.cookies.user_id;

  if (!user_id) {
    return res.redirect("/auth_user"); // Redirigir si no hay sesión
  }

  // Obtener los detalles del usuario
  db.get(`SELECT * FROM users WHERE user_id = ?`, [user_id], (err, user) => {
    if (err || !user) {
      console.error(err ? err.message : "Usuario no encontrado");
      return res.redirect("/auth_user");
    }

    // Renderizar la vista de cuenta con los datos del usuario
    res.render("account", { user });
  });
});

app.get("/logout", (req, res) => {
  res.clearCookie("user_id"); // Elimina la cookie
  res.redirect("/"); // Redirigir a la página de inicio
});

app.post("/mod_rev/edit", (req, res) => {
  const user_id = req.cookies.user_id; // Obtener el user_id de la cookie
  const { movie_id, review, rating } = req.body; // Obtener los datos del formulario

  if (!user_id) {
    return res.redirect("/auth_user"); // Redirigir si el usuario no está autenticado
  }

  // Primero verificamos si existe una reseña para la película y usuario en cuestión
  const checkReviewQuery = `
    SELECT * FROM movie_user WHERE user_id = ? AND movie_id = ?
  `;

  db.get(checkReviewQuery, [user_id, movie_id], (err, existingReview) => {
    if (err) {
      console.error("Error al verificar la reseña:", err.message);
      return res.send("Error al verificar la reseña.");
    }

    if (!existingReview) {
      // Si no se encuentra una reseña, enviar mensaje de error
      return res.send("No tienes una reseña para esta película.");
    }

    // Si existe la reseña, proceder a actualizarla
    const updateReviewQuery = `
      UPDATE movie_user
      SET review = ?, rating = ?
      WHERE user_id = ? AND movie_id = ?
    `;

    db.run(
      updateReviewQuery,
      [review, rating, user_id, movie_id],
      function (err) {
        if (err) {
          console.error("Error al actualizar la reseña:", err.message);
          return res.send("Error al actualizar la reseña.");
        }
        res.redirect("/account"); // Redirigir a la cuenta después de actualizar
      }
    );
  });
});

app.post("/mod_rev/delete", (req, res) => {
  const user_id = req.cookies.user_id;
  const { movie_id } = req.body;

  if (!user_id) {
    return res.redirect("/auth_user");
  }

  const checkReviewQuery = `
    SELECT * FROM movie_user WHERE user_id = ? AND movie_id = ?
  `;

  db.get(checkReviewQuery, [user_id, movie_id], (err, existingReview) => {
    if (err) {
      console.error("Error al verificar la reseña:", err.message);
      return res.send("Error al verificar la reseña.");
    }

    if (!existingReview) {
      return res.send("No tienes una reseña para esta película.");
    }

    const deleteReviewQuery = `
      DELETE FROM movie_user WHERE user_id = ? AND movie_id = ?
    `;

    db.run(deleteReviewQuery, [user_id, movie_id], function (err) {
      if (err) {
        console.error("Error al eliminar la reseña:", err.message);
        return res.send("Error al eliminar la reseña.");
      }
      res.redirect("/account");
    });
  });
});

app.post("/account/delete", (req, res) => {
  const user_id = req.cookies.user_id; // Obtener el user_id de la cookie

  if (!user_id) {
    return res.redirect("/auth_user"); // Redirigir si no hay sesión
  }

  // Eliminar el usuario de la base de datos
  db.run(`DELETE FROM users WHERE user_id = ?`, [user_id], function (err) {
    if (err) {
      console.error(err.message);
      return res.send("Error al eliminar la cuenta.");
    }

    // Eliminar el usuario de la tabla user_login
    db.run(
      `DELETE FROM user_login WHERE user_id = ?`,
      [user_id],
      function (err) {
        if (err) {
          console.error(err.message);
          return res.send("Error al eliminar los datos de login.");
        }

        // Borrar la cookie de la sesión
        res.clearCookie("user_id");

        // Redirigir a la página principal
        res.redirect("/");
      }
    );
  });
});

app.post("/account/edit", (req, res) => {
  const user_id = req.cookies.user_id; // Obtener el user_id de la cookie
  const { username, name, email, password } = req.body; // Obtener los datos del formulario

  if (!user_id) {
    return res.redirect("/auth_user"); // Redirigir si el usuario no está autenticado
  }

  // Actualizar primero el nombre, username y email
  db.run(
    `UPDATE users SET username = ?, name = ?, email = ? WHERE user_id = ?;`,
    [username, name, email, user_id],
    function (err) {
      if (err) {
        console.error(err.message);
        return res.send("Error al actualizar la cuenta.");
      }

      // Si se ha proporcionado una nueva contraseña, actualizarla en user_login
      if (password) {
        const hashedPassword = bcrypt.hashSync(password, 10); // Hashear la nueva contraseña

        db.run(
          `UPDATE user_login SET password = ? WHERE user_id = ?;`,
          [hashedPassword, user_id],
          function (err) {
            if (err) {
              console.error(err.message);
              return res.send("Error al actualizar la contraseña.");
            }

            // Redirigir a la página de la cuenta una vez actualizado
            res.redirect("/account");
          }
        );
      } else {
        // Si no se proporcionó nueva contraseña, redirigir a la página de la cuenta
        res.redirect("/account");
      }
    }
  );
});

app.post("/account/review", (req, res) => {
  const user_id = req.cookies.user_id; // Obtener el user_id de la cookie
  const { review, rating, movie_id } = req.body; // Obtener los datos del formulario

  if (!user_id) {
    return res.redirect("/auth_user"); // Redirigir si el usuario no está autenticado
  }

  // Insertar la reseña en la base de datos
  db.run(
    `INSERT INTO movie_user (user_id, movie_id, rating, review) VALUES (?, ?, ?, ?);`,
    [user_id, movie_id, rating, review],
    function (err) {
      if (err) {
        if (err.code === "SQLITE_CONSTRAINT") {
          // Código de error para duplicado en MySQL
          return res.send("Ya has dejado una reseña para esta película.");
        }
        return res.send("Error al publicar la reseña.");
      }

      // Recargar la página una vez publicada la reseña
      res.redirect(`/account`);
    }
  );
});

// Ruta para manejar login o registro
app.post("/auth", (req, res) => {
  const { username, password, action, user_name, email } = req.body;

  if (action === "login") {
    // Intentar iniciar sesión
    db.get(
      `SELECT user_id FROM users WHERE username = ?`,
      [username],
      (err, user) => {
        if (err || !user) {
          console.error(err ? err.message : "Usuario no encontrado");
          res.send("Error al iniciar sesión.");
        } else {
          db.get(
            `SELECT * FROM user_login WHERE user_id = ?`,
            [user.user_id],
            (err, loginData) => {
              if (
                err ||
                !loginData ||
                !bcrypt.compareSync(password, loginData.password)
              ) {
                res.send("Usuario o contraseña incorrectos.");
              } else {
                // Si la autenticación es exitosa, crear una cookie con el user_id
                res.cookie("user_id", user.user_id, {
                  httpOnly: true,
                  maxAge: 3600000,
                }); // Cookie válida por 1 hora
                res.redirect("/users");
              }
            }
          );
        }
      }
    );
  } else if (action === "register") {
    // Intentar crear cuenta
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insertar en la tabla 'users'
    db.run(
      `INSERT INTO users (username, name, email) VALUES (?, ?, ?)`,
      [username, user_name, email],
      function (err) {
        if (err) {
          console.error(err.message);
          res.send("Error al crear la cuenta.");
        } else {
          // Insertar en 'user_login' usando el user_id recién creado
          const user_id = this.lastID; // `this.lastID` obtiene el ID del usuario recién creado
          db.run(
            `INSERT INTO user_login (user_id, password) VALUES (?, ?)`,
            [user_id, hashedPassword],
            (err) => {
              if (err) {
                console.error(err.message);
                res.send("Error al crear el login.");
              } else {
                // Iniciar sesión automáticamente
                res.cookie("user_id", user_id, {
                  httpOnly: true,
                  maxAge: 3600000,
                }); // Cookie válida por 1 hora
                res.redirect("/users");
              }
            }
          );
        }
      }
    );
  }
});

app.get("/buscar", (req, res) => {
  const searchTerm = req.query.q;

  const queryMovies = `SELECT movie_id, title FROM movie WHERE title LIKE ?`;
  const queryActors = `SELECT distinct person.person_id, person.person_name, movie.movie_id, movie.title 
                        FROM person 
                        JOIN movie_cast ON person.person_id = movie_cast.person_id
                        JOIN movie ON movie_cast.movie_id = movie.movie_id
                        WHERE person.person_name LIKE ?
                        ORDER BY person.person_name ASC, movie.title ASC`;
  const queryDirectors = `SELECT distinct person.person_id, person.person_name, movie.movie_id, movie.title
                          FROM person 
                          JOIN movie_crew ON person.person_id = movie_crew.person_id
                          JOIN movie ON movie_crew.movie_id = movie.movie_id
                          WHERE person.person_name LIKE ? and job = 'Director'`;

  const searchValue = [`%${searchTerm}%`];

  db.all(queryMovies, searchValue, (err, movies) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error en la búsqueda de películas.");
      return;
    }

    db.all(queryActors, searchValue, (err, actors) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error en la búsqueda de actores.");
        return;
      }

      db.all(queryDirectors, searchValue, (err, directors) => {
        if (err) {
          console.error(err);
          res.status(500).send("Error en la búsqueda de directores.");
          return;
        }

        // Enviar todos los resultados a la vista
        res.render("resultado", {
          movies: movies,
          actors: actors,
          directors: directors,
        });
      });
    });
  });
});

app.get("/buscarKeyword", (req, res) => {
  const searchTerm = req.query.q;

  // Consulta para buscar películas por palabra clave
  const queryMoviesByKeyword = `
    SELECT distinct movie.movie_id, movie.title, movie.release_date, keyword_name
    FROM movie 
    JOIN movie_keywords ON movie.movie_id = movie_keywords.movie_id
    JOIN keyword ON movie_keywords.keyword_id = keyword.keyword_id
    WHERE keyword.keyword_name LIKE ?`;

  const searchValue = [`%${searchTerm}%`];

  // Ejecutar la consulta para buscar películas relacionadas con la palabra clave
  db.all(queryMoviesByKeyword, searchValue, (err, movies) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error en la búsqueda de películas.");
      return;
    }

    // Renderizar los resultados en la vista
    res.render("keywords_result", {
      movies: movies,
      searchTerm: searchTerm,
    });
  });
});

app.get("/buscarUsers", (req, res) => {
  const searchTerm = req.query.q;

  // Consulta para buscar usuarios por nombre de usuario
  const queryUsers = `
    SELECT user_id, username, name
    FROM users
    WHERE username LIKE ?`;

  const queryReviewedMovies = `
    SELECT movie.movie_id, movie.title, users.username, users.user_id, movie_user.rating, movie_user.review
    FROM movie_user
    JOIN movie ON movie_user.movie_id = movie.movie_id
    join users on movie_user.user_id = users.user_id
    WHERE movie.title LIKE ?`;

  const searchValue = [`%${searchTerm}%`];

  // Ejecutar la consulta para buscar usuarios
  db.all(queryUsers, searchValue, (err, users) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error en la búsqueda de usuarios.");
      return;
    }

    // Ejecutar la consulta para buscar películas reseñadas por los usuarios
    db.all(queryReviewedMovies, searchValue, (err, movies) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error en la búsqueda de películas.");
        return;
      }

      // Renderizar los resultados en la vista
      res.render("users_result", {
        users: users,
        movies: movies,
      });
    });
  });
});

app.get("/buscar-pelicula", (req, res) => {
  const searchTerm = req.query.q;

  // Buscar películas cuyo título coincida con el término de búsqueda
  db.all(
    `SELECT movie_id, title FROM movie WHERE title LIKE ? LIMIT 10`, // Limitar a 10 resultados
    [`%${searchTerm}%`],
    (err, movies) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: "Error al buscar películas." });
      }
      res.json({ movies }); // Devolver la lista de películas en formato JSON
    }
  );
});

// Ruta para la página de datos de una película particular
app.get("/pelicula/:id", (req, res) => {
  const movieId = req.params.id;

  // Consulta SQL para obtener los datos de la película, elenco y crew
  const query = `
    SELECT
    movie.*,
    actor.person_name as actor_name,
    actor.person_id as actor_id,
    crew_member.person_name as crew_member_name,
    crew_member.person_id as crew_member_id,
    movie_cast.character_name,
    movie_cast.cast_order,
    department.department_name,
    country.country_name AS country_name,
    GROUP_CONCAT(DISTINCT language.language_name) AS languages,
    GROUP_CONCAT(DISTINCT genre.genre_name) AS genres,
    GROUP_CONCAT(DISTINCT production_company.company_name) AS production_companies,
    movie_crew.job
    FROM movie
    LEFT JOIN movie_cast ON movie.movie_id = movie_cast.movie_id
    LEFT JOIN person as actor ON movie_cast.person_id = actor.person_id
    LEFT JOIN movie_crew ON movie.movie_id = movie_crew.movie_id
    LEFT JOIN department ON movie_crew.department_id = department.department_id
    LEFT JOIN person as crew_member ON crew_member.person_id = movie_crew.person_id
    LEFT JOIN production_country AS pc ON movie.movie_id = pc.movie_id
    LEFT JOIN country ON pc.country_id = country.country_id
    LEFT JOIN movie_languages ON movie.movie_id = movie_languages.movie_id
    LEFT JOIN language ON movie_languages.language_id = language.language_id
    LEFT JOIN movie_genres ON movie.movie_id = movie_genres.movie_id
    LEFT JOIN genre ON movie_genres.genre_id = genre.genre_id
    LEFT JOIN movie_company ON movie.movie_id = movie_company.movie_id
    LEFT JOIN production_company ON movie_company.company_id = production_company.company_id
    WHERE movie.movie_id = ?
    GROUP BY movie.movie_id, 
         movie.title, 
         movie.budget, 
         movie.homepage, 
         movie.overview, 
         movie.popularity, 
         movie.release_date, 
         movie.revenue, 
         movie.runtime, 
         movie.movie_status, 
         movie.tagline, 
         movie.vote_average, 
         movie.vote_count, 
         actor.person_name, 
         actor.person_id, 
         crew_member.person_name, 
         crew_member.person_id, 
         movie_cast.character_name, 
         movie_cast.cast_order, 
         department.department_name, 
         country.country_name, 
         movie_crew.job;
  `;

  // Ejecutar la consulta
  db.all(query, [movieId], (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error al cargar los datos de la película.");
    } else if (rows.length === 0) {
      res.status(404).send("Película no encontrada.");
    } else {
      // Organizar los datos en un objeto de película con elenco y crew
      const movieData = {
        id: rows[0].id,
        title: rows[0].title,
        release_date: rows[0].release_date,
        overview: rows[0].overview,
        runtime: rows[0].runtime,
        budget: rows[0].budget,
        revenue: rows[0].revenue,
        popularity: rows[0].popularity,
        vote_average: rows[0].vote_average,
        vote_count: rows[0].vote_count,
        homepage: rows[0].homepage,
        tagline: rows[0].tagline,
        movie_language: rows[0].languages,
        country_name: rows[0].country_name,
        genres: rows[0].genres,
        production_companies: rows[0].production_companies,
        movie_status: rows[0].movie_status,
        directors: [],
        writers: [],
        cast: [],
        crew: [],
      };

      // Crear un objeto para almacenar directores
      rows.forEach((row) => {
        if (
          row.crew_member_id &&
          row.crew_member_name &&
          row.department_name &&
          row.job
        ) {
          // Verificar si ya existe una entrada con los mismos valores en directors
          const isDuplicate = movieData.directors.some(
            (crew_member) => crew_member.crew_member_id === row.crew_member_id
          );

          if (!isDuplicate) {
            // Si no existe, agregar los datos a la lista de directors
            if (row.department_name === "Directing" && row.job === "Director") {
              movieData.directors.push({
                crew_member_id: row.crew_member_id,
                crew_member_name: row.crew_member_name,
                department_name: row.department_name,
                job: row.job,
              });
            }
          }
        }
      });

      // Crear un objeto para almacenar writers
      rows.forEach((row) => {
        if (
          row.crew_member_id &&
          row.crew_member_name &&
          row.department_name &&
          row.job
        ) {
          // Verificar si ya existe una entrada con los mismos valores en writers
          const isDuplicate = movieData.writers.some(
            (crew_member) => crew_member.crew_member_id === row.crew_member_id
          );

          if (!isDuplicate) {
            // Si no existe, agregar los datos a la lista de writers
            if (row.department_name === "Writing" && row.job === "Writer") {
              movieData.writers.push({
                crew_member_id: row.crew_member_id,
                crew_member_name: row.crew_member_name,
                department_name: row.department_name,
                job: row.job,
              });
            }
          }
        }
      });

      // Crear un objeto para almacenar el elenco
      rows.forEach((row) => {
        if (row.actor_id && row.actor_name && row.character_name) {
          // Verificar si ya existe una entrada con los mismos valores en el elenco
          const isDuplicate = movieData.cast.some(
            (actor) => actor.actor_id === row.actor_id
          );

          if (!isDuplicate) {
            // Si no existe, agregar los datos a la lista de elenco
            movieData.cast.push({
              actor_id: row.actor_id,
              actor_name: row.actor_name,
              character_name: row.character_name,
              cast_order: row.cast_order,
            });
          }
        }
      });

      // Crear un objeto para almacenar el crew
      rows.forEach((row) => {
        if (
          row.crew_member_id &&
          row.crew_member_name &&
          row.department_name &&
          row.job
        ) {
          // Verificar si ya existe una entrada con los mismos valores en el crew
          const isDuplicate = movieData.crew.some(
            (crew_member) => crew_member.crew_member_id === row.crew_member_id
          );

          if (!isDuplicate) {
            // Si no existe, agregar los datos a la lista de crew
            if (
              row.department_name !== "Directing" &&
              row.job !== "Director" &&
              row.department_name !== "Writing" &&
              row.job !== "Writer"
            ) {
              movieData.crew.push({
                crew_member_id: row.crew_member_id,
                crew_member_name: row.crew_member_name,
                department_name: row.department_name,
                job: row.job,
              });
            }
          }
        }
      });

      res.render("pelicula", { movie: movieData });
    }
  });
});

// Ruta para manejar actores y directores por su ID
app.get("/person/:id", (req, res) => {
  const personId = req.params.id;

  // Consulta para obtener películas en las que ha actuado la persona
  const queryActorMovies = `
    SELECT movie.movie_id, movie.title, 'actor' AS role
    FROM movie
    INNER JOIN movie_cast ON movie.movie_id = movie_cast.movie_id
    WHERE movie_cast.person_id = ?;
  `;

  // Consulta para obtener películas que ha dirigido la persona
  const queryDirectorMovies = `
    SELECT DISTINCT
      person.person_name as directorName,
      movie.*
    FROM movie
    INNER JOIN movie_crew ON movie.movie_id = movie_crew.movie_id
    INNER JOIN person ON person.person_id = movie_crew.person_id
    WHERE movie_crew.job = 'Director' AND movie_crew.person_id = ?;
  `;

  // Consulta para obtener el nombre de la persona
  const queryPersonName = `
    SELECT person_name 
    FROM person 
    WHERE person_id = ?;
  `;

  // Obtener el nombre de la persona
  db.get(queryPersonName, [personId], (err, person) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error al cargar la persona.");
      return;
    }

    if (!person) {
      res.status(404).send("Persona no encontrada.");
      return;
    }

    const personName = person.person_name;

    // Obtener las películas donde actuó
    db.all(queryActorMovies, [personId], (err, actorMovies) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error al cargar las películas del actor.");
        return;
      }

      // Obtener las películas donde dirigió
      db.all(queryDirectorMovies, [personId], (err, directorMovies) => {
        if (err) {
          console.error(err);
          res.status(500).send("Error al cargar las películas del director.");
          return;
        }

        // Combinar resultados y renderizar la página
        res.render("person", {
          personName,
          actorMovies,
          directorMovies,
        });
      });
    });
  });
});

// Ruta para mostrar la página de un actor específico
app.get("/actor/:id", (req, res) => {
  const actorId = req.params.id;

  // Consulta SQL para obtener las películas en las que participó el actor
  const query = `
    SELECT DISTINCT
      person.person_name as actorName,
      movie.*
    FROM movie
    INNER JOIN movie_cast ON movie.movie_id = movie_cast.movie_id
    INNER JOIN person ON person.person_id = movie_cast.person_id
    WHERE movie_cast.person_id = ?;
  `;

  // Ejecutar la consulta
  db.all(query, [actorId], (err, movies) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error al cargar las películas del actor.");
    } else {
      // Obtener el nombre del actor
      const actorName = movies.length > 0 ? movies[0].actorName : "";

      res.render("actor", { actorName, movies });
    }
  });
});

// Ruta para mostrar la página de un director específico
app.get("/director/:id", (req, res) => {
  const directorId = req.params.id;

  // Consulta SQL para obtener las películas dirigidas por el director
  const query = `
    SELECT DISTINCT
      person.person_name as directorName,
      movie.*
    FROM movie
    INNER JOIN movie_crew ON movie.movie_id = movie_crew.movie_id
    INNER JOIN person ON person.person_id = movie_crew.person_id
    WHERE movie_crew.job = 'Director' AND movie_crew.person_id = ?;
  `;

  // console.log('query = ', query)

  // Ejecutar la consulta
  db.all(query, [directorId], (err, movies) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error al cargar las películas del director.");
    } else {
      // console.log('movies.length = ', movies.length)
      // Obtener el nombre del director
      const directorName = movies.length > 0 ? movies[0].directorName : "";
      res.render("director", { directorName, movies });
    }
  });
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor en ejecución en http://localhost:${port}`);
});
