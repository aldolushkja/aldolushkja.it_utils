package it.aldolushkja.utils.rest;

import com.github.javafaker.Faker;
import it.aldolushkja.utils.interceptor.Loggable;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;

@Path("/faker")
@Loggable
public class FakerResource {

  @GET
  @Produces(MediaType.TEXT_PLAIN)
  public String getRandomLoremIpsum() {
    Faker faker = new Faker();
    return faker.lorem().paragraph(10);
  }
}
