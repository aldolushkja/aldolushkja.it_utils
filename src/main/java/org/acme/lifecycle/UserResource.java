package org.acme.lifecycle;

import java.util.List;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;

@Path("users")
@Produces(MediaType.APPLICATION_JSON)
@Loggable
public class UserResource {

  @GET
  public List<User> getUsers() {
    return User.findAll().list();
  }

  @GET
  @Path("/name/{name}")
  public User getUserByName(@PathParam("name") String name) {
    return User.find("username", name).firstResult();
  }


}
