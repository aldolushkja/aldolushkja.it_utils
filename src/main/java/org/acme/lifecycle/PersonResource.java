package org.acme.lifecycle;

import java.util.List;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

@Path("/utils/people")
@Produces(MediaType.APPLICATION_JSON)
@Loggable
public class PersonResource {

  @GET
  public List<Person> getPersons() {
    return Person.findAll().list();
  }


  @GET
  @Path("/name/{name}")
  public Person getPersonByName(@PathParam("name") String name) {
    return Person.findByName(name);
  }

  @GET
  @Path("/role/{role}")
  public Response getPersonByRole(@PathParam("role") String name) {
    return Response.status(200).entity(Person.findByRoleName(name)).build();
  }


}
